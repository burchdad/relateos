import json
import logging
import re
import uuid
from datetime import datetime, timezone
from email.utils import parseaddr

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.taxonomy import normalize_role, role_metadata
from app.models.entities import Meeting, MeetingAttendee, Person
from app.schemas.engagement import EngagementCaptureRequest, EngagementEventCreate
from app.schemas.meeting import (
    AttendeeImportRequest,
    InboundInviteRequest,
    InboundInviteResponse,
    MeetingCreate,
    MeetingFollowUpResponse,
    MeetingIntelligenceReportRequest,
    MeetingIntelligenceReportResponse,
    MeetingUpdate,
)
from app.services.engagement_service import EngagementService
from app.services.network_service import NetworkService


MEETING_URL_PATTERN = re.compile(
    r'(https?://(?:[a-zA-Z0-9-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com|skool\.com)[^\s<>"]*)',
    flags=re.IGNORECASE,
)


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _parse_datetime(value: str | None) -> datetime | None:
    raw = _clean(value)
    if not raw:
        return None

    try:
        from dateutil import parser as dt_parser

        parsed = dt_parser.parse(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _extract_ics_value(ical_text: str | None, key: str) -> str | None:
    if not ical_text:
        return None
    pattern = re.compile(rf"^{re.escape(key)}(?:;[^:]+)?:\s*(.+)$", flags=re.MULTILINE | re.IGNORECASE)
    match = pattern.search(ical_text)
    if not match:
        return None
    return match.group(1).strip()


def _extract_meeting_url(*texts: str | None) -> str | None:
    for text in texts:
        if not text:
            continue
        match = MEETING_URL_PATTERN.search(text)
        if match:
            return match.group(1)
    return None


def _detect_platform(url: str | None, explicit_platform: str | None) -> str | None:
    explicit = _clean(explicit_platform).lower()
    if explicit:
        return explicit
    value = _clean(url).lower()
    if "zoom.us" in value:
        return "zoom"
    if "meet.google.com" in value:
        return "google_meet"
    if "teams.microsoft.com" in value:
        return "teams"
    if "webex.com" in value:
        return "webex"
    if "skool.com" in value:
        return "skool"
    return None


def _extract_attendees_from_ics(ical_text: str | None) -> list[dict[str, str | None]]:
    if not ical_text:
        return []

    attendees: list[dict[str, str | None]] = []
    for line in ical_text.splitlines():
        if not line.upper().startswith("ATTENDEE"):
            continue

        role_match = re.search(r"ROLE=([^;:]+)", line, flags=re.IGNORECASE)
        cn_match = re.search(r"CN=([^;:]+)", line, flags=re.IGNORECASE)
        email_match = re.search(r"mailto:([^\s;:]+)", line, flags=re.IGNORECASE)
        attendees.append(
            {
                "name": cn_match.group(1).strip() if cn_match else None,
                "email": email_match.group(1).strip().lower() if email_match else None,
                "role": role_match.group(1).strip().lower() if role_match else None,
            }
        )
    return attendees


class MeetingService:
    @staticmethod
    def create(db: Session, payload: MeetingCreate) -> Meeting:
        meeting = Meeting(
            id=uuid.uuid4(),
            title=payload.title,
            platform=payload.platform,
            meeting_url=payload.meeting_url,
            scheduled_at=payload.scheduled_at,
            transcript=payload.transcript,
        )
        db.add(meeting)
        db.commit()
        db.refresh(meeting)
        return meeting

    @staticmethod
    def _find_existing_report_meeting(
        db: Session,
        provider: str | None,
        external_meeting_id: str | None,
    ) -> Meeting | None:
        if not provider or not external_meeting_id:
            return None
        return (
            db.query(Meeting)
            .filter(
                Meeting.source_provider == provider,
                Meeting.external_meeting_id == external_meeting_id,
            )
            .first()
        )

    @staticmethod
    def get_by_id(db: Session, meeting_id: uuid.UUID) -> Meeting | None:
        return db.query(Meeting).filter(Meeting.id == meeting_id).first()

    @staticmethod
    def _upsert_meeting_edges(
        db: Session,
        meeting: Meeting,
        contact_ids: list[uuid.UUID],
        *,
        source: str,
        reason: str,
        strength: float = 1.0,
    ) -> int:
        unique_contact_ids = list(dict.fromkeys(contact_ids))
        edges_created = 0
        for idx, source_id in enumerate(unique_contact_ids[:25]):
            for target_id in unique_contact_ids[idx + 1 : 25]:
                try:
                    _edge, created = NetworkService.upsert_edge(
                        db,
                        source_id,
                        target_id,
                        relationship_type="met_in_meeting",
                        strength=strength,
                        evidence={
                            "source": source,
                            "meeting_id": str(meeting.id),
                            "meeting_title": meeting.title,
                            "reason": reason,
                        },
                    )
                    if created:
                        edges_created += 1
                except ValueError:
                    continue
        return edges_created

    @staticmethod
    def list_all(db: Session, limit: int = 50) -> list[Meeting]:
        return db.query(Meeting).order_by(Meeting.created_at.desc()).limit(limit).all()

    @staticmethod
    def update(db: Session, meeting_id: uuid.UUID, payload: MeetingUpdate) -> Meeting | None:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            return None
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(meeting, field, value)
        db.commit()
        db.refresh(meeting)
        return meeting

    @staticmethod
    def import_attendees(db: Session, meeting_id: uuid.UUID, payload: AttendeeImportRequest) -> dict:
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            return {"error": "meeting not found"}

        contacts_created = 0
        attendees_added = 0
        contact_ids: list[uuid.UUID] = []

        for row in payload.rows:
            contact_id = None
            if row.email and payload.auto_create_contacts:
                from app.services.contact_service import ContactService
                contact = ContactService.find_or_create_by_email(db, row.email, row.name)
                contact_id = contact.id
                if contact.source is None:
                    contact.source = "meeting"
                    contacts_created += 1
                    db.commit()
                contact_ids.append(contact.id)

            attendee = MeetingAttendee(
                id=uuid.uuid4(),
                meeting_id=meeting_id,
                contact_id=contact_id,
                name=row.name,
                email=row.email,
                attendance_status=row.attendance_status,
                duration_seconds=row.duration_seconds,
            )
            db.add(attendee)
            attendees_added += 1

        edges_created = MeetingService._upsert_meeting_edges(
            db,
            meeting,
            contact_ids,
            source="manual_attendee_import",
            reason="Co-attended meeting captured by attendee import.",
        )
        db.commit()
        return {
            "attendees_added": attendees_added,
            "contacts_created": contacts_created,
            "relationship_edges_created": edges_created,
        }

    @staticmethod
    def ingest_intelligence_report(
        db: Session,
        payload: MeetingIntelligenceReportRequest,
    ) -> MeetingIntelligenceReportResponse:
        provider = _clean(payload.provider).lower() or "read_ai"
        meeting = MeetingService._find_existing_report_meeting(db, provider, payload.external_meeting_id)
        if meeting is None:
            meeting = Meeting(
                id=uuid.uuid4(),
                title=payload.title,
                platform=payload.platform,
                meeting_url=payload.meeting_url,
                started_at=payload.started_at,
                ended_at=payload.ended_at,
                scheduled_at=payload.started_at,
                source_provider=provider,
                external_meeting_id=payload.external_meeting_id,
            )
            db.add(meeting)
            db.flush()

        meeting.title = payload.title or meeting.title
        meeting.platform = payload.platform or meeting.platform
        meeting.meeting_url = payload.meeting_url or meeting.meeting_url
        meeting.started_at = payload.started_at or meeting.started_at
        meeting.ended_at = payload.ended_at or meeting.ended_at
        meeting.summary = payload.summary or meeting.summary
        meeting.transcript = payload.transcript or meeting.transcript
        meeting.action_items = [item.model_dump() for item in payload.action_items]
        meeting.raw_report = payload.raw_payload or {
            "provider": provider,
            "external_meeting_id": payload.external_meeting_id,
        }

        contacts_created = 0
        attendees_added = 0
        contact_ids: list[uuid.UUID] = []

        for participant in payload.participants:
            contact_id = None
            email = _clean(participant.email).lower() or None
            name = _clean(participant.name) or None
            if email and payload.auto_create_contacts:
                from app.services.contact_service import ContactService

                existing = db.query(Person).filter(Person.email == email).first()
                contact = ContactService.find_or_create_by_email(db, email, name)
                contact_id = contact.id
                if existing is None:
                    contacts_created += 1
                if contact.source is None:
                    contact.source = provider
                if participant.role and not contact.primary_role:
                    contact.primary_role = normalize_role(participant.role)
                    metadata = role_metadata(contact.primary_role)
                    contact.role_family = metadata.get("role_family")
                    contact.market_segment = metadata.get("market_segment")
                if contact_id not in contact_ids:
                    contact_ids.append(contact_id)

            existing_attendee = None
            if email:
                existing_attendee = (
                    db.query(MeetingAttendee)
                    .filter(MeetingAttendee.meeting_id == meeting.id, MeetingAttendee.email == email)
                    .first()
                )
            if existing_attendee is None:
                db.add(
                    MeetingAttendee(
                        id=uuid.uuid4(),
                        meeting_id=meeting.id,
                        contact_id=contact_id,
                        name=name,
                        email=email,
                        attendance_status="attended",
                        duration_seconds=participant.talk_time_seconds or 0,
                    )
                )
                attendees_added += 1
            else:
                existing_attendee.contact_id = existing_attendee.contact_id or contact_id
                existing_attendee.name = name or existing_attendee.name
                existing_attendee.duration_seconds = participant.talk_time_seconds or existing_attendee.duration_seconds

        edges_created = MeetingService._upsert_meeting_edges(
            db,
            meeting,
            contact_ids,
            source=provider,
            reason="Co-attended meeting captured by meeting intelligence.",
            strength=1.2,
        )

        if payload.summary or payload.action_items:
            for contact_id in contact_ids[:50]:
                EngagementService.create(
                    db,
                    EngagementEventCreate(
                        contact_id=contact_id,
                        event_type="meeting_summary_captured",
                        source_platform=provider,
                        summary=payload.summary,
                        raw_payload={
                            "meeting_id": str(meeting.id),
                            "action_items": [item.model_dump() for item in payload.action_items],
                        },
                    ),
                )

        db.commit()
        db.refresh(meeting)
        return MeetingIntelligenceReportResponse(
            meeting_id=meeting.id,
            attendees_added=attendees_added,
            contacts_created=contacts_created,
            action_items_created=len(payload.action_items),
            relationship_edges_created=edges_created,
        )

    @staticmethod
    def generate_followups(db: Session, meeting_id: uuid.UUID) -> MeetingFollowUpResponse:
        """
        AI meeting follow-up generator. Uses GPT-4o when OPENAI_API_KEY is set,
        otherwise falls back to deterministic templates.
        """
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise ValueError("Meeting not found")

        attendees = db.query(MeetingAttendee).filter(MeetingAttendee.meeting_id == meeting_id).all()

        if settings.openai_api_key:
            try:
                from openai import OpenAI
                client = OpenAI(api_key=settings.openai_api_key)
                attendee_list = "\n".join(
                    f"- {a.name or 'Unknown'} ({a.email or 'no email'})" for a in attendees
                )
                prompt = (
                    f"Meeting title: {meeting.title}\n"
                    f"Summary: {meeting.summary or 'None provided'}\n"
                    f"Transcript excerpt: {(meeting.transcript or '')[:800]}\n"
                    f"Attendees:\n{attendee_list}\n\n"
                    "Return a JSON object with these keys:\n"
                    "- summary (string): 2-3 sentence meeting summary\n"
                    "- action_items (array of strings): top 3 action items\n"
                    "- followup_drafts (array): each item has attendee_name, email, subject, body\n"
                    "- deal_opportunities (array of strings): potential deals to track\n"
                    "Return only valid JSON, no markdown."
                )
                raw = client.chat.completions.create(
                    model=settings.openai_model or "gpt-4o",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.4,
                    response_format={"type": "json_object"},
                ).choices[0].message.content or ""
                data = json.loads(raw)
                return MeetingFollowUpResponse(
                    meeting_id=meeting_id,
                    summary=data.get("summary", meeting.summary or meeting.title),
                    action_items=data.get("action_items", []),
                    followup_drafts=data.get("followup_drafts", []),
                    contacts_to_create=[],
                    deal_opportunities=data.get("deal_opportunities", []),
                )
            except Exception as exc:
                logging.getLogger(__name__).warning("AI follow-up generation failed, using fallback: %s", exc)

        # Deterministic fallback
        summary = meeting.summary or f"Meeting: {meeting.title}. Review transcript for details."
        action_items = meeting.action_items or ["Follow up with attendees", "Review meeting notes"]

        followup_drafts = [
            {
                "attendee_name": a.name or a.email or "Attendee",
                "email": a.email,
                "subject": f"Great connecting at {meeting.title}",
                "body": (
                    f"Hey {a.name or 'there'},\n\nGreat connecting at {meeting.title}. "
                    "Wanted to follow up and continue the conversation. "
                    "Let me know if you have any questions or next steps in mind.\n\nThanks!"
                ),
            }
            for a in attendees
        ]

        contacts_to_create = [
            {"name": a.name, "email": a.email}
            for a in attendees
            if a.contact_id is None and (a.name or a.email)
        ]

        return MeetingFollowUpResponse(
            meeting_id=meeting_id,
            summary=summary,
            action_items=action_items,
            followup_drafts=followup_drafts,
            contacts_to_create=contacts_to_create,
            deal_opportunities=[],
        )

    @staticmethod
    def ingest_invite(db: Session, payload: InboundInviteRequest) -> InboundInviteResponse:
        ical_title = _extract_ics_value(payload.ical_text, "SUMMARY")
        ical_start = _extract_ics_value(payload.ical_text, "DTSTART")
        ical_end = _extract_ics_value(payload.ical_text, "DTEND")
        ical_desc = _extract_ics_value(payload.ical_text, "DESCRIPTION")
        ical_url = _extract_ics_value(payload.ical_text, "URL")

        title = _clean(payload.event_title) or _clean(ical_title) or _clean(payload.subject) or "Inbound Meeting Invite"
        scheduled_at = payload.starts_at or _parse_datetime(ical_start)
        ended_at = payload.ends_at or _parse_datetime(ical_end)
        description = _clean(payload.description) or _clean(ical_desc)
        meeting_url = _clean(payload.meeting_url) or _clean(ical_url) or _extract_meeting_url(description, payload.raw_payload.get("body", ""))
        platform = _detect_platform(meeting_url, payload.platform)

        meeting = Meeting(
            id=uuid.uuid4(),
            title=title,
            platform=platform,
            meeting_url=meeting_url or None,
            scheduled_at=scheduled_at,
            ended_at=ended_at,
            summary=(
                "Auto-captured by agent mailbox intake."
                + (f" Provider: {payload.provider}." if payload.provider else "")
            ),
            transcript=description[:6000] if description else None,
            action_items=[],
        )
        db.add(meeting)
        db.flush()

        attendees_from_payload = [
            {
                "name": _clean(a.name) or None,
                "email": _clean(a.email).lower() or None,
                "role": _clean(a.role) or None,
            }
            for a in payload.attendees
            if _clean(a.name) or _clean(a.email)
        ]
        attendees_from_ics = _extract_attendees_from_ics(payload.ical_text)

        merged: dict[str, dict[str, str | None]] = {}
        for attendee in attendees_from_payload + attendees_from_ics:
            email_key = (attendee.get("email") or "").lower()
            key = email_key or f"name::{(attendee.get('name') or '').lower()}"
            if not key or key == "name::":
                continue
            existing = merged.get(key, {})
            merged[key] = {
                "name": attendee.get("name") or existing.get("name"),
                "email": attendee.get("email") or existing.get("email"),
                "role": attendee.get("role") or existing.get("role"),
            }

        attendees_added = 0
        contacts_created = 0
        contact_ids: list[uuid.UUID] = []

        for attendee in merged.values():
            contact_id = None
            attendee_email = attendee.get("email")
            attendee_name = attendee.get("name")

            if attendee_email and payload.auto_create_contacts:
                from app.services.contact_service import ContactService

                existing = db.query(Person).filter(Person.email == attendee_email).first()
                contact = ContactService.find_or_create_by_email(db, attendee_email, attendee_name)
                contact_id = contact.id
                if existing is None:
                    contacts_created += 1
                if contact.source is None:
                    contact.source = "meeting_invite"
                contact_ids.append(contact.id)

            db.add(
                MeetingAttendee(
                    id=uuid.uuid4(),
                    meeting_id=meeting.id,
                    contact_id=contact_id,
                    name=attendee_name,
                    email=attendee_email,
                    attendance_status="invited",
                    duration_seconds=0,
                    followup_status="not_started",
                )
            )
            attendees_added += 1

        MeetingService._upsert_meeting_edges(
            db,
            meeting,
            contact_ids,
            source=platform or payload.provider or "meeting_invite",
            reason="Co-invited attendees captured from calendar or mailbox intake.",
            strength=0.8,
        )

        sender_name, sender_email = parseaddr(_clean(payload.from_email) or "")
        sender_final_email = (sender_email or _clean(payload.from_email)).strip().lower() or None
        sender_final_name = _clean(payload.from_name) or _clean(sender_name) or None

        engagement_event_id = None
        if sender_final_email or sender_final_name:
            capture = EngagementService.capture(
                db,
                EngagementCaptureRequest(
                    name=sender_final_name,
                    email=sender_final_email,
                    event_type="meeting_invite_received",
                    source_platform=platform or payload.provider,
                    occurred_at=scheduled_at,
                    notes=f"Invite captured for '{title}'.",
                    raw_payload={
                        "meeting_id": str(meeting.id),
                        "meeting_title": title,
                        "meeting_url": meeting_url,
                        "provider": payload.provider,
                        "source_mailbox": payload.source_mailbox,
                    },
                    auto_create_contact=payload.auto_create_contacts,
                ),
            )
            engagement_event_id = str(capture.get("id")) if capture.get("id") else None

        db.commit()
        db.refresh(meeting)

        return InboundInviteResponse(
            meeting_id=meeting.id,
            title=meeting.title,
            platform=meeting.platform,
            meeting_url=meeting.meeting_url,
            attendees_added=attendees_added,
            contacts_created=contacts_created,
            engagement_event_id=engagement_event_id,
        )

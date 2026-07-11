from __future__ import annotations

import uuid
import re
from datetime import datetime
from typing import Any
from uuid import UUID

from dateutil import parser as dt_parser
from sqlalchemy.orm import Session

from app.models import ContentItem, Event, Meeting, MeetingAttendee, Person
from app.services.admin_service import WorkspaceAdminService
from app.services.contact_service import ContactService
from app.services.google_calendar_service import GoogleCalendarService
from app.services.network_service import NetworkService


class CalendarIngestionService:
    @staticmethod
    def sync_google_calendar(db: Session, *, workspace_id: UUID) -> dict[str, Any]:
        auto_create_contacts = WorkspaceAdminService.policy_settings(
            db,
            workspace_id=workspace_id,
        ).auto_create_contacts_from_meetings
        events = GoogleCalendarService.list_events_for_workspace(db, workspace_id=workspace_id)
        meetings_imported = 0
        attendees_imported = 0
        contacts_created = 0
        content_imported = 0
        errors: list[str] = []

        for event_payload in events:
            try:
                result = CalendarIngestionService._upsert_calendar_event(
                    db,
                    workspace_id=workspace_id,
                    event_payload=event_payload,
                    auto_create_contacts=auto_create_contacts,
                )
                meetings_imported += int(result["meeting_created"])
                attendees_imported += int(result["attendees_imported"])
                contacts_created += int(result["contacts_created"])
                content_imported += int(result["content_created"])
            except Exception as exc:
                title = event_payload.get("summary") or event_payload.get("id") or "Calendar event"
                errors.append(f"{title}: {exc}")

        return {
            "status": "partial" if errors else "completed",
            "events_found": len(events),
            "meetings_imported": meetings_imported,
            "attendees_imported": attendees_imported,
            "contacts_created": contacts_created,
            "content_imported": content_imported,
            "errors": errors,
        }

    @staticmethod
    def attendees_for_calendar_event(db: Session, *, workspace_id: UUID, calendar_event_id: str | None) -> list[MeetingAttendee]:
        if not calendar_event_id:
            return []
        meeting = (
            db.query(Meeting)
            .filter(
                Meeting.workspace_id == workspace_id,
                Meeting.source_provider == "google_calendar",
                Meeting.external_meeting_id == calendar_event_id,
            )
            .first()
        )
        return meeting.attendees if meeting else []

    @staticmethod
    def _upsert_calendar_event(
        db: Session,
        *,
        workspace_id: UUID,
        event_payload: dict[str, Any],
        auto_create_contacts: bool,
    ) -> dict[str, int]:
        external_id = str(event_payload.get("id") or "")
        if not external_id:
            return {"meeting_created": 0, "attendees_imported": 0, "contacts_created": 0, "content_created": 0}

        title = str(event_payload.get("summary") or "Untitled calendar meeting")
        description = str(event_payload.get("description") or "")
        meeting_url = CalendarIngestionService._meeting_url(event_payload)
        scheduled_at = CalendarIngestionService._event_datetime(event_payload.get("start"))
        ended_at = CalendarIngestionService._event_datetime(event_payload.get("end"))
        platform = CalendarIngestionService._platform(meeting_url)

        meeting = (
            db.query(Meeting)
            .filter(
                Meeting.workspace_id == workspace_id,
                Meeting.source_provider == "google_calendar",
                Meeting.external_meeting_id == external_id,
            )
            .first()
        )
        meeting_created = 0
        if not meeting:
            meeting = Meeting(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                title=title,
                platform=platform,
                meeting_url=meeting_url,
                scheduled_at=scheduled_at,
                ended_at=ended_at,
                source_provider="google_calendar",
                external_meeting_id=external_id,
                raw_report=event_payload,
            )
            db.add(meeting)
            meeting_created = 1
        else:
            meeting.title = title
            meeting.platform = platform or meeting.platform
            meeting.meeting_url = meeting_url or meeting.meeting_url
            meeting.scheduled_at = scheduled_at or meeting.scheduled_at
            meeting.ended_at = ended_at or meeting.ended_at
            meeting.raw_report = event_payload

        app_event = (
            db.query(Event)
            .filter(Event.workspace_id == workspace_id, Event.calendar_event_id == external_id)
            .first()
        )
        if app_event:
            meeting.source_event_id = app_event.id

        db.flush()

        contact_ids: list[UUID] = []
        contacts_created = 0
        attendees_imported = 0
        for attendee_payload in event_payload.get("attendees") or []:
            attendee_email = str(attendee_payload.get("email") or "").strip().lower()
            attendee_name = str(attendee_payload.get("displayName") or "").strip() or None
            if not attendee_email:
                continue

            contact = CalendarIngestionService._find_contact(db, workspace_id=workspace_id, email=attendee_email)
            if not contact and auto_create_contacts:
                contact = ContactService.find_or_create_by_email(db, attendee_email, attendee_name, workspace_id=workspace_id)
                if contact.source in (None, "import"):
                    contact.source = "google_calendar"
                contacts_created += 1
            if contact:
                contact_ids.append(contact.id)

            attendee = (
                db.query(MeetingAttendee)
                .filter(MeetingAttendee.meeting_id == meeting.id, MeetingAttendee.email == attendee_email)
                .first()
            )
            status = CalendarIngestionService._attendance_status(attendee_payload)
            if not attendee:
                attendee = MeetingAttendee(
                    id=uuid.uuid4(),
                    meeting_id=meeting.id,
                    contact_id=contact.id if contact else None,
                    name=attendee_name,
                    email=attendee_email,
                    attendance_status=status,
                )
                db.add(attendee)
                attendees_imported += 1
            else:
                attendee.contact_id = contact.id if contact else attendee.contact_id
                attendee.name = attendee_name or attendee.name
                attendee.attendance_status = status

        if contact_ids:
            CalendarIngestionService._upsert_edges(db, meeting, contact_ids)

        content_created = CalendarIngestionService._ensure_content_item(
            db,
            workspace_id=workspace_id,
            title=title,
            description=description,
            source_url=meeting_url or event_payload.get("htmlLink") or f"google-calendar:{external_id}",
            source_type="zoom" if platform == "zoom" else "website",
        )
        db.commit()
        return {
            "meeting_created": meeting_created,
            "attendees_imported": attendees_imported,
            "contacts_created": contacts_created,
            "content_created": content_created,
        }

    @staticmethod
    def _find_contact(db: Session, *, workspace_id: UUID, email: str) -> Person | None:
        return db.query(Person).filter(Person.workspace_id == workspace_id, Person.email == email).first()

    @staticmethod
    def _ensure_content_item(
        db: Session,
        *,
        workspace_id: UUID,
        title: str,
        description: str,
        source_url: str,
        source_type: str,
    ) -> int:
        existing = (
            db.query(ContentItem)
            .filter(ContentItem.workspace_id == workspace_id, ContentItem.source_url == source_url)
            .first()
        )
        if existing:
            existing.title = title
            existing.description = description or existing.description
            return 0
        db.add(
            ContentItem(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                title=title,
                description=description or "Calendar meeting imported for follow-up intelligence.",
                source_type=source_type,
                source_url=source_url,
            )
        )
        return 1

    @staticmethod
    def _upsert_edges(db: Session, meeting: Meeting, contact_ids: list[UUID]) -> None:
        unique_contact_ids = list(dict.fromkeys(contact_ids))
        for idx, source_id in enumerate(unique_contact_ids[:25]):
            for target_id in unique_contact_ids[idx + 1 : 25]:
                try:
                    NetworkService.upsert_edge(
                        db,
                        source_id,
                        target_id,
                        relationship_type="met_in_meeting",
                        strength=0.75,
                        workspace_id=meeting.workspace_id,
                        evidence={
                            "source": "google_calendar_attendees",
                            "meeting_id": str(meeting.id),
                            "meeting_title": meeting.title,
                            "reason": "Co-invited attendees captured from Google Calendar.",
                        },
                    )
                except ValueError:
                    continue

    @staticmethod
    def _event_datetime(value: dict[str, Any] | None) -> datetime | None:
        if not value:
            return None
        raw = value.get("dateTime") or value.get("date")
        if not raw:
            return None
        return dt_parser.parse(str(raw))

    @staticmethod
    def _meeting_url(event_payload: dict[str, Any]) -> str | None:
        conference = event_payload.get("conferenceData") or {}
        for entry in conference.get("entryPoints") or []:
            uri = entry.get("uri")
            if uri:
                return str(uri)
        for field in ("hangoutLink", "location", "description", "htmlLink"):
            value = event_payload.get(field)
            if not value:
                continue
            match = re_search_url(str(value))
            if match:
                return match
        return None

    @staticmethod
    def _platform(url: str | None) -> str | None:
        value = (url or "").lower()
        if "zoom.us" in value:
            return "zoom"
        if "meet.google.com" in value:
            return "google_meet"
        if "teams.microsoft.com" in value:
            return "teams"
        if "skool.com" in value:
            return "skool"
        return "calendar"

    @staticmethod
    def _attendance_status(attendee_payload: dict[str, Any]) -> str:
        status = str(attendee_payload.get("responseStatus") or "needs_action").lower()
        return {
            "accepted": "accepted",
            "declined": "declined",
            "tentative": "tentative",
            "needsaction": "invited",
            "needs_action": "invited",
        }.get(status, status or "invited")


def re_search_url(value: str) -> str | None:
    match = re.search(r'https?://[^\s<>"]+', value)
    return match.group(0) if match else None

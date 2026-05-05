import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Meeting, MeetingAttendee, Person
from app.schemas.meeting import (
    AttendeeImportRequest,
    MeetingCreate,
    MeetingFollowUpResponse,
    MeetingUpdate,
)


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
    def get_by_id(db: Session, meeting_id: uuid.UUID) -> Meeting | None:
        return db.query(Meeting).filter(Meeting.id == meeting_id).first()

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

        db.commit()
        return {"attendees_added": attendees_added, "contacts_created": contacts_created}

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

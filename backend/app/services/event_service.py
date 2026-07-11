from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Event, Person
from app.schemas.event import EventCreate
from app.services.audit_service import AuditService
from app.services.calendar_ingestion_service import CalendarIngestionService
from app.services.google_calendar_service import GoogleCalendarService
from app.services.google_email_service import GoogleEmailService


DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


class EventService:
    @staticmethod
    def create_event(db: Session, payload: EventCreate, workspace_id: UUID | None = None) -> Event:
        event = Event(
            workspace_id=workspace_id,
            title=payload.title.strip(),
            description=payload.description.strip(),
            event_type=payload.event_type,
            event_url=payload.event_url.strip(),
            day_of_week=payload.day_of_week,
            time_of_day=payload.time_of_day.strip(),
            calendar_start_date=payload.calendar_start_date,
            owner_user_id=payload.owner_user_id,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        if payload.add_to_calendar and workspace_id:
            try:
                calendar_event = GoogleCalendarService.create_event_for_workspace(db, event=event, workspace_id=workspace_id)
                event.calendar_event_id = calendar_event.get("id")
                event.calendar_event_url = calendar_event.get("htmlLink")
                event.calendar_sync_status = "synced"
                event.calendar_sync_error = None
            except Exception as exc:
                event.calendar_sync_status = "failed"
                event.calendar_sync_error = str(exc)
            db.commit()
            db.refresh(event)
        return event

    @staticmethod
    def get_events(db: Session, workspace_id: UUID | None = None) -> list[Event]:
        q = db.query(Event)
        if workspace_id:
            q = q.filter(Event.workspace_id == workspace_id)
        events = q.order_by(Event.created_at.desc()).all()
        if workspace_id:
            EventService._attach_calendar_attendees(db, events, workspace_id)
        return events

    @staticmethod
    def get_event_by_id(db: Session, event_id: UUID, workspace_id: UUID | None = None) -> Event | None:
        q = db.query(Event).filter(Event.id == event_id)
        if workspace_id:
            q = q.filter(Event.workspace_id == workspace_id)
        event = q.first()
        if event and workspace_id:
            EventService._attach_calendar_attendees(db, [event], workspace_id)
        return event

    @staticmethod
    def send_invites(
        db: Session,
        *,
        event_id: UUID,
        contact_ids: list[UUID],
        workspace_id: UUID,
        user=None,
    ) -> dict:
        event = EventService.get_event_by_id(db, event_id, workspace_id=workspace_id)
        if not event:
            raise ValueError("Event not found")

        unique_contact_ids = list(dict.fromkeys(contact_ids))
        contacts = (
            db.query(Person)
            .filter(Person.workspace_id == workspace_id, Person.id.in_(unique_contact_ids))
            .all()
        )
        contacts_by_id = {contact.id: contact for contact in contacts}
        skipped = [
            contact_id
            for contact_id in unique_contact_ids
            if contact_id not in contacts_by_id or not contacts_by_id[contact_id].email
        ]

        subject = f"Invite: {event.title}"
        body = EventService._invite_body(event)
        sent = 0
        for contact in contacts:
            if not contact.email:
                continue
            GoogleEmailService.send_email_for_workspace(
                db,
                workspace_id=workspace_id,
                to_email=contact.email,
                subject=subject,
                body=body,
            )
            sent += 1

        AuditService.log(
            db,
            workspace_id=workspace_id,
            user=user,
            action_type="event_invites_sent",
            target_type="event",
            target_id=event.id,
            metadata={
                "sent": sent,
                "requested": len(unique_contact_ids),
                "skipped": [str(contact_id) for contact_id in skipped],
            },
        )
        return {"sent": sent, "skipped": skipped}

    @staticmethod
    def _invite_body(event: Event) -> str:
        schedule_day = "One-time" if event.day_of_week is None else DAY_LABELS[int(event.day_of_week)]
        parts = [
            f"You're invited to {event.title}.",
            "",
            event.description,
            "",
            f"When: {schedule_day} at {event.time_of_day}",
            f"Link: {event.event_url}",
        ]
        return "\n".join(part for part in parts if part is not None)

    @staticmethod
    def _attach_calendar_attendees(db: Session, events: list[Event], workspace_id: UUID) -> None:
        for event in events:
            event.attendees = CalendarIngestionService.attendees_for_calendar_event(
                db,
                workspace_id=workspace_id,
                calendar_event_id=event.calendar_event_id,
            )

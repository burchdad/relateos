from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Event
from app.schemas.event import EventCreate
from app.services.google_calendar_service import GoogleCalendarService


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
        return q.order_by(Event.created_at.desc()).all()

    @staticmethod
    def get_event_by_id(db: Session, event_id: UUID, workspace_id: UUID | None = None) -> Event | None:
        q = db.query(Event).filter(Event.id == event_id)
        if workspace_id:
            q = q.filter(Event.workspace_id == workspace_id)
        return q.first()

from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Event
from app.schemas.event import EventCreate


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
            owner_user_id=payload.owner_user_id,
        )
        db.add(event)
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

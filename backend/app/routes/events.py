from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.event import EventCreate, EventOut
from app.services.event_service import EventService


router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventOut, status_code=201)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    return EventService.create_event(db, payload)


@router.get("", response_model=list[EventOut])
def get_events(db: Session = Depends(get_db)):
    return EventService.get_events(db)

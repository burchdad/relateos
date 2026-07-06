from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.workspace import workspace_id_for_user
from app.models import AppUser
from app.schemas.event import EventCreate, EventOut
from app.services.event_service import EventService


router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventOut, status_code=201)
def create_event(payload: EventCreate, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return EventService.create_event(db, payload, workspace_id=workspace_id_for_user(db, user))


@router.get("", response_model=list[EventOut])
def get_events(db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return EventService.get_events(db, workspace_id=workspace_id_for_user(db, user))

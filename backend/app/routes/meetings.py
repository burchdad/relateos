import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.meeting import (
    AttendeeImportRequest,
    MeetingCreate,
    MeetingFollowUpResponse,
    MeetingOut,
    MeetingUpdate,
)
from app.services.meeting_service import MeetingService

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("", response_model=list[MeetingOut])
def list_meetings(db: Session = Depends(get_db)):
    return MeetingService.list_all(db)


@router.post("", response_model=MeetingOut, status_code=201)
def create_meeting(payload: MeetingCreate, db: Session = Depends(get_db)):
    return MeetingService.create(db, payload)


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: uuid.UUID, db: Session = Depends(get_db)):
    meeting = MeetingService.get_by_id(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.put("/{meeting_id}", response_model=MeetingOut)
def update_meeting(meeting_id: uuid.UUID, payload: MeetingUpdate, db: Session = Depends(get_db)):
    meeting = MeetingService.update(db, meeting_id, payload)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("/{meeting_id}/attendees/import")
def import_attendees(meeting_id: uuid.UUID, payload: AttendeeImportRequest, db: Session = Depends(get_db)):
    return MeetingService.import_attendees(db, meeting_id, payload)


@router.post("/{meeting_id}/generate-followups", response_model=MeetingFollowUpResponse)
def generate_followups(meeting_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        return MeetingService.generate_followups(db, meeting_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

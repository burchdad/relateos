import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.workspace import workspace_id_for_user
from app.models import AppUser
from app.schemas.meeting import (
    AttendeeImportRequest,
    InboundInviteRequest,
    InboundInviteResponse,
    MeetingCreate,
    MeetingFollowUpResponse,
    MeetingIntelligenceReportRequest,
    MeetingIntelligenceReportResponse,
    MeetingOut,
    MeetingRecordingAnalysisResponse,
    MeetingUpdate,
)
from app.services.meeting_service import MeetingService
from app.services.recording_intelligence_service import RecordingIntelligenceService

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("", response_model=list[MeetingOut])
def list_meetings(db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return MeetingService.list_all(db, workspace_id=workspace_id_for_user(db, user))


@router.post("", response_model=MeetingOut, status_code=201)
def create_meeting(payload: MeetingCreate, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return MeetingService.create(db, payload, workspace_id=workspace_id_for_user(db, user))


@router.post("/inbound-invite", response_model=InboundInviteResponse, status_code=201)
def ingest_inbound_invite(payload: InboundInviteRequest, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return MeetingService.ingest_invite(db, payload, workspace_id=workspace_id_for_user(db, user))


@router.post("/intelligence-report", response_model=MeetingIntelligenceReportResponse, status_code=201)
def ingest_meeting_intelligence_report(payload: MeetingIntelligenceReportRequest, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return MeetingService.ingest_intelligence_report(db, payload, workspace_id=workspace_id_for_user(db, user))


@router.post("/analyze-recording/{meeting_id}", response_model=MeetingRecordingAnalysisResponse)
def analyze_recording_static(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    try:
        return RecordingIntelligenceService.analyze(db, meeting_id, workspace_id=workspace_id_for_user(db, user))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    meeting = MeetingService.get_by_id(db, meeting_id, workspace_id=workspace_id_for_user(db, user))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.put("/{meeting_id}", response_model=MeetingOut)
def update_meeting(meeting_id: uuid.UUID, payload: MeetingUpdate, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    meeting = MeetingService.update(db, meeting_id, payload, workspace_id=workspace_id_for_user(db, user))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("/{meeting_id}/attendees/import")
def import_attendees(meeting_id: uuid.UUID, payload: AttendeeImportRequest, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return MeetingService.import_attendees(db, meeting_id, payload, workspace_id=workspace_id_for_user(db, user))


@router.post("/{meeting_id}/generate-followups", response_model=MeetingFollowUpResponse)
def generate_followups(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    try:
        return MeetingService.generate_followups(db, meeting_id, workspace_id=workspace_id_for_user(db, user))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{meeting_id}/analyze-recording", response_model=MeetingRecordingAnalysisResponse)
def analyze_recording(meeting_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    try:
        return RecordingIntelligenceService.analyze(db, meeting_id, workspace_id=workspace_id_for_user(db, user))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

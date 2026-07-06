import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.workspace import workspace_id_for_user
from app.models import AppUser
from app.schemas.engagement import (
    EngagementCaptureRequest,
    EngagementEventCreate,
    EngagementEventOut,
    EngagementImportRequest,
)
from app.services.engagement_service import EngagementService

router = APIRouter(prefix="/engagement-events", tags=["engagement"])


@router.get("", response_model=list[EngagementEventOut])
def list_events(
    contact_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    user: AppUser = Depends(current_user),
):
    return EngagementService.list_all(db, contact_id=contact_id, limit=limit, workspace_id=workspace_id_for_user(db, user))


@router.post("", response_model=EngagementEventOut, status_code=201)
def create_event(payload: EngagementEventCreate, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return EngagementService.create(db, payload, workspace_id=workspace_id_for_user(db, user))


@router.post("/import")
def import_events(payload: EngagementImportRequest, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    result = EngagementService.bulk_import(db, payload, workspace_id=workspace_id_for_user(db, user))
    return result


@router.post("/capture")
def capture_event(payload: EngagementCaptureRequest, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return EngagementService.capture(db, payload, workspace_id=workspace_id_for_user(db, user))

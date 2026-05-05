import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.engagement import EngagementEventCreate, EngagementEventOut, EngagementImportRequest
from app.services.engagement_service import EngagementService

router = APIRouter(prefix="/engagement-events", tags=["engagement"])


@router.get("", response_model=list[EngagementEventOut])
def list_events(
    contact_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    return EngagementService.list_all(db, contact_id=contact_id, limit=limit)


@router.post("", response_model=EngagementEventOut, status_code=201)
def create_event(payload: EngagementEventCreate, db: Session = Depends(get_db)):
    return EngagementService.create(db, payload)


@router.post("/import")
def import_events(payload: EngagementImportRequest, db: Session = Depends(get_db)):
    result = EngagementService.bulk_import(db, payload)
    return result

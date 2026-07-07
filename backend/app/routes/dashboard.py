from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.workspace import workspace_id_for_user
from app.models import AppUser
from app.schemas.dashboard import MorningBrief, PriorityItem, ScoreExplanation
from app.schemas.timeline import FollowUpQueueItem
from app.services.dashboard_service import get_followup_queue, get_morning_brief, get_score_explanation, get_top_priorities


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/priorities", response_model=list[PriorityItem])
def priorities(limit: int = Query(default=10, ge=5, le=10), db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return get_top_priorities(db, limit, workspace_id=workspace_id_for_user(db, user))


@router.get("/followups", response_model=list[FollowUpQueueItem])
def followups(limit: int = Query(default=10, ge=5, le=25), db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return get_followup_queue(db, limit, workspace_id=workspace_id_for_user(db, user))


@router.get("/morning-brief", response_model=MorningBrief)
def morning_brief(limit: int = Query(default=5, ge=3, le=10), db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return get_morning_brief(db, workspace_id=workspace_id_for_user(db, user), limit=limit)


@router.get("/score-explanation/{relationship_id}", response_model=ScoreExplanation)
def score_explanation(relationship_id: UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    payload = get_score_explanation(db, relationship_id, workspace_id=workspace_id_for_user(db, user))
    if not payload:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return payload

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.dashboard import PriorityItem, ScoreExplanation
from app.services.dashboard_service import get_score_explanation, get_top_priorities


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/priorities", response_model=list[PriorityItem])
def priorities(limit: int = Query(default=10, ge=5, le=10), db: Session = Depends(get_db)):
    return get_top_priorities(db, limit)


@router.get("/score-explanation/{relationship_id}", response_model=ScoreExplanation)
def score_explanation(relationship_id: UUID, db: Session = Depends(get_db)):
    payload = get_score_explanation(db, relationship_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return payload

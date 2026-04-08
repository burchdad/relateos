from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.dashboard import PriorityItem
from app.services.dashboard_service import get_top_priorities


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/priorities", response_model=list[PriorityItem])
def priorities(limit: int = Query(default=10, ge=5, le=10), db: Session = Depends(get_db)):
    return get_top_priorities(db, limit)

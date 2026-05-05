import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.network import NetworkGraphResponse, ScoreboardResponse
from app.services.network_service import NetworkService

router = APIRouter(prefix="/network", tags=["network"])


@router.get("/graph", response_model=NetworkGraphResponse)
def network_graph(
    organization_id: Optional[uuid.UUID] = Query(None),
    contact_id: Optional[uuid.UUID] = Query(None),
    depth: int = Query(2, ge=1, le=5),
    min_strength: float = Query(0.0),
    role: Optional[str] = Query(None),
    revenue_min: float = Query(0.0),
    db: Session = Depends(get_db),
):
    return NetworkService.get_graph(
        db,
        organization_id=organization_id,
        contact_id=contact_id,
        depth=depth,
        min_strength=min_strength,
        role=role,
        revenue_min=revenue_min,
    )


@router.get("/scoreboard", response_model=ScoreboardResponse)
def scoreboard(db: Session = Depends(get_db)):
    return NetworkService.get_scoreboard(db)

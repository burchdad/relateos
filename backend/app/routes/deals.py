import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.schemas.deal import DealCreate, DealOut, DealUpdate, NaturalLanguageDealInput, NaturalLanguageDealResult
from app.services.deal_service import DealService

router = APIRouter(prefix="/deals", tags=["deals"])


@router.get("", response_model=list[DealOut])
def list_deals(
    deal_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    organization_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("deals:read")),
):
    return DealService.list_all(db, deal_type=deal_type, status=status, organization_id=organization_id, limit=limit, workspace_id=context.workspace_id)


@router.post("", response_model=DealOut, status_code=201)
def create_deal(payload: DealCreate, db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("deals:write"))):
    try:
        return DealService.create(db, payload, workspace_id=context.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{deal_id}", response_model=DealOut)
def get_deal(deal_id: uuid.UUID, db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("deals:read"))):
    deal = DealService.get_by_id(db, deal_id, workspace_id=context.workspace_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.put("/{deal_id}", response_model=DealOut)
def update_deal(deal_id: uuid.UUID, payload: DealUpdate, db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("deals:write"))):
    deal = DealService.update(db, deal_id, payload, workspace_id=context.workspace_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post("/natural-log", response_model=NaturalLanguageDealResult)
def natural_log_deal(payload: NaturalLanguageDealInput, db: Session = Depends(get_db)):
    return DealService.parse_natural_language(payload.text)

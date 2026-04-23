from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.relateos import (
    ApplyCampaignAdjustmentsResponse,
    CampaignOptimizationResponse,
    RecalculateScoresResponse,
    SignalPresetResponse,
    SignalPresetUpdateRequest,
)
from app.services.campaign_optimization_service import CampaignOptimizationService
from app.services.relateos_service import get_active_signal_preset, set_active_signal_preset
from app.services.scoring_service import recalculate_all_priority_scores


router = APIRouter(prefix="/relateos", tags=["relateos"])


@router.get("/signal-preset", response_model=SignalPresetResponse)
def get_signal_preset(db: Session = Depends(get_db)):
    return SignalPresetResponse.model_validate(get_active_signal_preset(db))


@router.put("/signal-preset", response_model=SignalPresetResponse)
def put_signal_preset(payload: SignalPresetUpdateRequest, db: Session = Depends(get_db)):
    try:
        updated = set_active_signal_preset(db, payload.preset_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SignalPresetResponse.model_validate(updated)


@router.post("/recalculate-scores", response_model=RecalculateScoresResponse)
def recalculate_scores_now(db: Session = Depends(get_db)):
    updated = recalculate_all_priority_scores(db)
    return RecalculateScoresResponse(updated_count=updated)


@router.get("/campaign-insights", response_model=CampaignOptimizationResponse)
def get_campaign_insights(db: Session = Depends(get_db)):
    return CampaignOptimizationResponse.model_validate(CampaignOptimizationService.build_insights(db))


@router.post("/campaign-insights/apply", response_model=ApplyCampaignAdjustmentsResponse)
def apply_campaign_adjustments(db: Session = Depends(get_db)):
    return ApplyCampaignAdjustmentsResponse.model_validate(CampaignOptimizationService.apply_suggested_adjustments(db))

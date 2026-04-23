from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.content import (
    ContentEngagementUpdateRequest,
    ContentCreate,
    ContentItemOut,
    ContentInsightOut,
    ContentSummaryResponse,
    FollowUpExecuteRequest,
    FollowUpExecuteResponse,
    ContentTargetOut,
    FollowUpResponse,
)
from app.services.content_ai_service import ContentAIService
from app.services.content_service import ContentService
from app.services.followup_service import FollowUpSuggestionService
from app.services.targeting_service import TargetingService


router = APIRouter(prefix="/content", tags=["content"])


def _serialize_content_item(db: Session, item) -> ContentItemOut:
    latest = ContentService.latest_insight(db, item.id)
    payload = ContentItemOut.model_validate(item)
    if latest:
        payload.latest_insight = ContentInsightOut.model_validate(latest)
    return payload


@router.post("", response_model=ContentItemOut, status_code=201)
def create_content(payload: ContentCreate, db: Session = Depends(get_db)):
    item = ContentService.create_content_item(db, payload)
    # Best-effort bootstrap to keep content records immediately useful in the UI.
    try:
        ContentAIService().generate_content_summary(db, item.id)
    except Exception:
        pass
    return _serialize_content_item(db, item)


@router.get("", response_model=list[ContentItemOut])
def list_content(db: Session = Depends(get_db)):
    items = ContentService.get_all_content_items(db)
    return [_serialize_content_item(db, item) for item in items]


@router.get("/{content_id}", response_model=ContentItemOut)
def get_content(content_id: UUID, db: Session = Depends(get_db)):
    item = ContentService.get_content_by_id(db, content_id)
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")
    return _serialize_content_item(db, item)


@router.post("/{content_id}/generate-summary", response_model=ContentSummaryResponse)
def generate_summary(content_id: UUID, db: Session = Depends(get_db)):
    item = ContentService.get_content_by_id(db, content_id)
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")

    insight = ContentAIService().generate_content_summary(db, content_id)
    return ContentSummaryResponse(
        summary=insight.summary,
        key_points=insight.key_points,
        suggested_angles=insight.suggested_angles,
    )


@router.get("/{content_id}/targets", response_model=list[ContentTargetOut])
def suggest_targets(content_id: UUID, db: Session = Depends(get_db)):
    item = ContentService.get_content_by_id(db, content_id)
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")

    targets = TargetingService.suggest_relationship_targets(db, content_id)
    output: list[ContentTargetOut] = []
    for target in targets:
        relationship = target.relationship
        name = "Unknown contact"
        if relationship and relationship.person:
            name = f"{relationship.person.first_name} {relationship.person.last_name}"
        output.append(
            ContentTargetOut(
                relationship_id=target.relationship_id,
                name=name,
                reason=target.reason,
                engagement_status=target.engagement_status,
                delivery_count=target.delivery_count,
                last_sent_at=target.last_sent_at,
                last_engagement_at=target.last_engagement_at,
            )
        )
    return output


@router.get("/{content_id}/followups", response_model=FollowUpResponse)
def get_followups(content_id: UUID, db: Session = Depends(get_db)):
    item = ContentService.get_content_by_id(db, content_id)
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")

    payload = FollowUpSuggestionService.generate_content_followups(db, content_id)
    return FollowUpResponse.model_validate(payload)


@router.post("/{content_id}/followups/execute", response_model=FollowUpExecuteResponse)
def execute_followup(content_id: UUID, payload: FollowUpExecuteRequest, db: Session = Depends(get_db)):
    item = ContentService.get_content_by_id(db, content_id)
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")

    try:
        result = FollowUpSuggestionService.execute_followup_step(
            db,
            content_id,
            day_offset=payload.day_offset,
            relationship_ids=payload.relationship_ids,
            dispatch_mode=payload.dispatch_mode,
            delay_window_minutes=payload.delay_window_minutes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return FollowUpExecuteResponse.model_validate(result)


@router.post("/{content_id}/engagement", response_model=ContentTargetOut)
def update_engagement(content_id: UUID, payload: ContentEngagementUpdateRequest, db: Session = Depends(get_db)):
    item = ContentService.get_content_by_id(db, content_id)
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")

    try:
        target = FollowUpSuggestionService.update_engagement_status(
            db,
            content_id,
            relationship_id=payload.relationship_id,
            status=payload.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    relationship = target.relationship
    name = "Unknown contact"
    if relationship and relationship.person:
        name = f"{relationship.person.first_name} {relationship.person.last_name}"

    return ContentTargetOut(
        relationship_id=target.relationship_id,
        name=name,
        reason=target.reason,
        engagement_status=target.engagement_status,
        delivery_count=target.delivery_count,
        last_sent_at=target.last_sent_at,
        last_engagement_at=target.last_engagement_at,
    )

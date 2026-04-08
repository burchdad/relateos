from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.ai import AIResponse, MessageSuggestionRequest
from app.services.ai_service import AIService


router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/summary/{relationship_id}", response_model=AIResponse)
def summary(relationship_id: UUID, db: Session = Depends(get_db)):
    content = AIService().generate_contact_summary(db, relationship_id)
    return AIResponse(content=content)


@router.post("/message/{relationship_id}", response_model=AIResponse)
def message(relationship_id: UUID, payload: MessageSuggestionRequest, db: Session = Depends(get_db)):
    content = AIService().generate_message_suggestion_with_style(
        db,
        relationship_id,
        payload.goal,
        style_override=payload.style_profile.model_dump() if payload.style_profile else None,
    )
    return AIResponse(content=content)


@router.post("/insights/{relationship_id}", response_model=AIResponse)
def insights(relationship_id: UUID, db: Session = Depends(get_db)):
    content = AIService().generate_insights(db, relationship_id)
    return AIResponse(content=content)

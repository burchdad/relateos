from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.models import AssistantActionLog
from app.schemas.ai import AIResponse, AssistantActionLogOut, AssistantRequest, AssistantResponse, MessageSuggestionRequest
from app.services.ai_service import AIService
from app.services.assistant_service import AssistantService


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


@router.post("/assistant", response_model=AssistantResponse)
def assistant(
    payload: AssistantRequest,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("workspace:read")),
):
    return AssistantService().handle(db, payload=payload, context=context)


@router.get("/assistant/actions", response_model=list[AssistantActionLogOut])
def assistant_actions(
    limit: int = 25,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("workspace:read")),
):
    capped_limit = max(1, min(limit, 100))
    return (
        db.query(AssistantActionLog)
        .filter(AssistantActionLog.workspace_id == context.workspace_id)
        .order_by(AssistantActionLog.created_at.desc())
        .limit(capped_limit)
        .all()
    )

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.schemas.outbox import OutboxMessageCreate, OutboxMessageOut, OutboxMessageUpdate
from app.services.outbox_service import OutboxService


router = APIRouter(prefix="/outbox", tags=["outbox"])


@router.get("", response_model=list[OutboxMessageOut])
def list_outbox_messages(
    status: str | None = Query("all"),
    task_id: uuid.UUID | None = Query(None),
    contact_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("tasks:read")),
):
    return OutboxService.list_messages(
        db,
        workspace_id=context.workspace_id,
        status=status,
        task_id=task_id,
        contact_id=contact_id,
        limit=limit,
    )


@router.post("", response_model=OutboxMessageOut, status_code=201)
def create_outbox_message(
    payload: OutboxMessageCreate,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("tasks:write")),
):
    try:
        return OutboxService.create_message(db, payload=payload, workspace_id=context.workspace_id, user=context.user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{message_id}", response_model=OutboxMessageOut)
def update_outbox_message(
    message_id: uuid.UUID,
    payload: OutboxMessageUpdate,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("tasks:write")),
):
    try:
        message = OutboxService.update_message(db, message_id=message_id, payload=payload, workspace_id=context.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not message:
        raise HTTPException(status_code=404, detail="Outbox message not found")
    return message


@router.post("/{message_id}/send", response_model=OutboxMessageOut)
def send_outbox_message(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("tasks:write")),
):
    message = OutboxService.send_message(db, message_id=message_id, workspace_id=context.workspace_id, user=context.user)
    if not message:
        raise HTTPException(status_code=404, detail="Outbox message not found")
    return message

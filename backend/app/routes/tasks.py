import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.schemas.task import FollowUpTaskCreate, FollowUpTaskOut, FollowUpTaskUpdate
from app.services.task_service import TaskService


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[FollowUpTaskOut])
def list_tasks(
    status: str | None = Query("open"),
    assigned_to_user_id: uuid.UUID | None = Query(None),
    contact_id: uuid.UUID | None = Query(None),
    relationship_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("tasks:read")),
):
    return TaskService.list_tasks(
        db,
        workspace_id=context.workspace_id,
        status=status,
        assigned_to_user_id=assigned_to_user_id,
        contact_id=contact_id,
        relationship_id=relationship_id,
        limit=limit,
    )


@router.post("", response_model=FollowUpTaskOut, status_code=201)
def create_task(
    payload: FollowUpTaskCreate,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("tasks:write")),
):
    try:
        return TaskService.create_task(db, payload=payload, workspace_id=context.workspace_id, user=context.user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{task_id}", response_model=FollowUpTaskOut)
def update_task(
    task_id: uuid.UUID,
    payload: FollowUpTaskUpdate,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("tasks:write")),
):
    try:
        task = TaskService.update_task(db, task_id=task_id, payload=payload, workspace_id=context.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("tasks:delete")),
):
    if not TaskService.delete_task(db, task_id=task_id, workspace_id=context.workspace_id):
        raise HTTPException(status_code=404, detail="Task not found")

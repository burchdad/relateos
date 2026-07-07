import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.models import AppUser, FollowUpTask, Relationship, WorkspaceMembership
from app.schemas.task import FollowUpTaskCreate, FollowUpTaskUpdate
from app.services.interaction_service import InteractionService
from app.schemas.interaction import InteractionCreate


def _contact_name(task: FollowUpTask) -> str | None:
    contact = task.contact or (task.relationship.person if task.relationship else None)
    if not contact:
        return None
    name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
    return name or contact.email or "Unknown contact"


def _serialize_task(task: FollowUpTask) -> dict:
    return {
        "id": task.id,
        "workspace_id": task.workspace_id,
        "relationship_id": task.relationship_id,
        "contact_id": task.contact_id,
        "contact_name": _contact_name(task),
        "title": task.title,
        "description": task.description,
        "suggested_message": task.suggested_message,
        "task_type": task.task_type,
        "status": task.status,
        "priority": task.priority,
        "due_at": task.due_at,
        "assigned_to_user_id": task.assigned_to_user_id,
        "created_by_user_id": task.created_by_user_id,
        "completed_at": task.completed_at,
        "metadata_json": task.metadata_json or {},
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


class TaskService:
    @staticmethod
    def list_tasks(
        db: Session,
        *,
        workspace_id: uuid.UUID,
        status: str | None = "open",
        assigned_to_user_id: uuid.UUID | None = None,
        contact_id: uuid.UUID | None = None,
        relationship_id: uuid.UUID | None = None,
        limit: int = 100,
    ) -> list[dict]:
        q = (
            db.query(FollowUpTask)
            .options(joinedload(FollowUpTask.relationship).joinedload(Relationship.person), joinedload(FollowUpTask.contact))
            .filter(FollowUpTask.workspace_id == workspace_id)
        )
        if status and status != "all":
            q = q.filter(FollowUpTask.status == status)
        if assigned_to_user_id:
            q = q.filter(FollowUpTask.assigned_to_user_id == assigned_to_user_id)
        if contact_id:
            q = q.filter(FollowUpTask.contact_id == contact_id)
        if relationship_id:
            q = q.filter(FollowUpTask.relationship_id == relationship_id)
        rows = q.order_by(FollowUpTask.due_at.asc().nullslast(), FollowUpTask.created_at.desc()).limit(limit).all()
        return [_serialize_task(task) for task in rows]

    @staticmethod
    def create_task(db: Session, *, payload: FollowUpTaskCreate, workspace_id: uuid.UUID, user: AppUser) -> dict:
        relationship = None
        contact_id = payload.contact_id
        if payload.relationship_id:
            relationship = (
                db.query(Relationship)
                .filter(Relationship.id == payload.relationship_id, Relationship.workspace_id == workspace_id)
                .first()
            )
            if not relationship:
                raise ValueError("Relationship not found")
            contact_id = contact_id or relationship.person_id

        if payload.assigned_to_user_id:
            membership = (
                db.query(WorkspaceMembership)
                .filter(
                    WorkspaceMembership.workspace_id == workspace_id,
                    WorkspaceMembership.user_id == payload.assigned_to_user_id,
                    WorkspaceMembership.status == "active",
                )
                .first()
            )
            if not membership:
                raise ValueError("Assigned user is not active in this workspace")

        task = FollowUpTask(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            relationship_id=payload.relationship_id,
            contact_id=contact_id,
            title=payload.title.strip(),
            description=payload.description,
            suggested_message=payload.suggested_message,
            task_type=payload.task_type or "follow_up",
            priority=payload.priority or "normal",
            due_at=payload.due_at,
            assigned_to_user_id=payload.assigned_to_user_id,
            created_by_user_id=user.id,
            metadata_json=payload.metadata_json or {},
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return _serialize_task(task)

    @staticmethod
    def update_task(db: Session, *, task_id: uuid.UUID, payload: FollowUpTaskUpdate, workspace_id: uuid.UUID) -> dict | None:
        task = db.query(FollowUpTask).filter(FollowUpTask.id == task_id, FollowUpTask.workspace_id == workspace_id).first()
        if not task:
            return None

        updates = payload.model_dump(exclude_unset=True)
        next_status = updates.get("status")
        if updates.get("assigned_to_user_id"):
            membership = (
                db.query(WorkspaceMembership)
                .filter(
                    WorkspaceMembership.workspace_id == workspace_id,
                    WorkspaceMembership.user_id == updates["assigned_to_user_id"],
                    WorkspaceMembership.status == "active",
                )
                .first()
            )
            if not membership:
                raise ValueError("Assigned user is not active in this workspace")

        for field, value in updates.items():
            setattr(task, field, value)

        if next_status == "completed" and not task.completed_at:
            task.completed_at = datetime.now(timezone.utc)
            if task.relationship_id:
                InteractionService.log_interaction(
                    db,
                    InteractionCreate(
                        relationship_id=task.relationship_id,
                        type="task_completed",
                        content=task.suggested_message or task.description or task.title,
                        summary=f"Completed task: {task.title}",
                        sentiment=0.7,
                    ),
                    workspace_id=workspace_id,
                )
                task = db.query(FollowUpTask).filter(FollowUpTask.id == task_id, FollowUpTask.workspace_id == workspace_id).first()
        elif next_status and next_status != "completed":
            task.completed_at = None

        db.commit()
        db.refresh(task)
        return _serialize_task(task)

    @staticmethod
    def delete_task(db: Session, *, task_id: uuid.UUID, workspace_id: uuid.UUID) -> bool:
        task = db.query(FollowUpTask).filter(FollowUpTask.id == task_id, FollowUpTask.workspace_id == workspace_id).first()
        if not task:
            return False
        db.delete(task)
        db.commit()
        return True

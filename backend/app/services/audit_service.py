import uuid

from sqlalchemy.orm import Session

from app.models import AppUser, AssistantActionLog


class AuditService:
    @staticmethod
    def log(
        db: Session,
        *,
        workspace_id: uuid.UUID,
        user: AppUser | None,
        action_type: str,
        status: str = "completed",
        target_type: str | None = None,
        target_id: uuid.UUID | None = None,
        metadata: dict | None = None,
        prompt: str | None = None,
    ) -> None:
        db.add(
            AssistantActionLog(
                workspace_id=workspace_id,
                user_id=user.id if user else None,
                action_type=action_type,
                status=status,
                prompt=prompt,
                target_type=target_type,
                target_id=target_id,
                metadata_json=metadata or {},
            )
        )
        db.commit()

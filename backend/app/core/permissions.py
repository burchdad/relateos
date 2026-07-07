import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.workspace import workspace_id_for_user
from app.models import AppUser, WorkspaceMembership


ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": {"*"},
    "admin": {
        "workspace:read",
        "workspace:manage",
        "members:read",
        "members:invite",
        "members:manage",
        "settings:manage",
        "connections:manage",
        "contacts:read",
        "contacts:write",
        "contacts:delete",
        "events:read",
        "events:write",
        "events:invite_contacts",
        "content:read",
        "content:write",
        "deals:read",
        "deals:write",
        "imports:run",
        "meetings:read",
        "meetings:write",
        "tasks:read",
        "tasks:write",
        "tasks:delete",
        "automation:run",
    },
    "member": {
        "workspace:read",
        "members:read",
        "contacts:read",
        "contacts:write",
        "events:read",
        "events:write",
        "events:invite_contacts",
        "content:read",
        "content:write",
        "deals:read",
        "deals:write",
        "imports:run",
        "meetings:read",
        "meetings:write",
        "tasks:read",
        "tasks:write",
    },
    "viewer": {
        "workspace:read",
        "contacts:read",
        "events:read",
        "content:read",
        "deals:read",
        "meetings:read",
        "tasks:read",
    },
}

VALID_ROLES = set(ROLE_PERMISSIONS)


@dataclass(frozen=True)
class WorkspaceContext:
    user: AppUser
    workspace_id: uuid.UUID
    membership: WorkspaceMembership
    role: str
    permissions: set[str]

    def has(self, permission: str) -> bool:
        return "*" in self.permissions or permission in self.permissions


def ensure_membership_for_user(db: Session, user: AppUser, workspace_id: uuid.UUID) -> WorkspaceMembership:
    membership = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.user_id == user.id,
        )
        .first()
    )
    if membership:
        return membership

    role = "owner"
    membership = WorkspaceMembership(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        user_id=user.id,
        role=role,
        status="active",
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def workspace_context(db: Session, user: AppUser) -> WorkspaceContext:
    workspace_id = workspace_id_for_user(db, user)
    membership = ensure_membership_for_user(db, user, workspace_id)
    if membership.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace access is disabled.")
    role = membership.role if membership.role in ROLE_PERMISSIONS else "viewer"
    return WorkspaceContext(
        user=user,
        workspace_id=workspace_id,
        membership=membership,
        role=role,
        permissions=ROLE_PERMISSIONS[role],
    )


def current_workspace_context(
    db: Session = Depends(get_db),
    user: AppUser = Depends(current_user),
) -> WorkspaceContext:
    return workspace_context(db, user)


def require_permission(permission: str):
    def dependency(
        db: Session = Depends(get_db),
        user: AppUser = Depends(current_user),
    ) -> WorkspaceContext:
        context = workspace_context(db, user)
        if not context.has(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to do that in this workspace.",
            )
        return context

    return dependency

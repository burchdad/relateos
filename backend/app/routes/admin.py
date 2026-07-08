import hmac
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.schemas.admin import (
    SoftwareAdminOverview,
    SupportAccessCreateRequest,
    SupportAccessCreateResponse,
    SupportAccessGrantOut,
    SupportSessionOut,
    WorkspaceAdminOverview,
)
from app.services.admin_service import SoftwareAdminService, WorkspaceAdminService
from app.services.audit_service import AuditService


workspace_router = APIRouter(prefix="/workspace-admin", tags=["workspace-admin"])
software_router = APIRouter(prefix="/software-admin", tags=["software-admin"])
support_router = APIRouter(prefix="/support", tags=["support"])


@workspace_router.get("/overview", response_model=WorkspaceAdminOverview)
def workspace_admin_overview(
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("workspace:manage")),
):
    return WorkspaceAdminOverview.model_validate(
        WorkspaceAdminService.overview(db, workspace_id=context.workspace_id, current_role=context.role)
    )


@workspace_router.get("/support-access", response_model=list[SupportAccessGrantOut])
def list_support_access(
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("workspace:manage")),
):
    return WorkspaceAdminService.list_support_access(db, workspace_id=context.workspace_id)


@workspace_router.post("/support-access", response_model=SupportAccessCreateResponse, status_code=201)
def create_support_access(
    payload: SupportAccessCreateRequest,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("workspace:manage")),
):
    grant, token = WorkspaceAdminService.create_support_access(
        db,
        workspace_id=context.workspace_id,
        created_by=context.user,
        label=payload.label,
        access_level=payload.access_level,
        expires_in_hours=payload.expires_in_hours,
    )
    AuditService.log(
        db,
        workspace_id=context.workspace_id,
        user=context.user,
        action_type="support_access_create",
        target_type="support_access_grant",
        target_id=grant.id,
        metadata={"label": grant.label, "access_level": grant.access_level, "expires_at": grant.expires_at.isoformat()},
    )
    return SupportAccessCreateResponse(
        grant=SupportAccessGrantOut.model_validate(grant),
        token=token,
        message="Support access created. Copy this token now; it will not be shown again.",
    )


@workspace_router.delete("/support-access/{grant_id}", status_code=204)
def revoke_support_access(
    grant_id: uuid.UUID,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("workspace:manage")),
):
    try:
        WorkspaceAdminService.revoke_support_access(db, workspace_id=context.workspace_id, grant_id=grant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    AuditService.log(
        db,
        workspace_id=context.workspace_id,
        user=context.user,
        action_type="support_access_revoke",
        target_type="support_access_grant",
        target_id=grant_id,
    )


def _require_software_admin(x_software_admin_token: str | None = Header(default=None)) -> None:
    if not settings.software_admin_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Software admin access is not configured.")
    if not x_software_admin_token or not hmac.compare_digest(x_software_admin_token, settings.software_admin_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Software admin authentication required.")


@software_router.get("/overview", response_model=SoftwareAdminOverview)
def software_admin_overview(
    db: Session = Depends(get_db),
    _: None = Depends(_require_software_admin),
):
    return SoftwareAdminOverview.model_validate(SoftwareAdminService.overview(db))


@support_router.get("/session", response_model=SupportSessionOut)
def support_session(
    db: Session = Depends(get_db),
    x_support_access_token: str | None = Header(default=None),
):
    if not x_support_access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Support access token required.")
    try:
        grant = WorkspaceAdminService.validate_support_token(db, token=x_support_access_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    permissions = ["workspace:read", "contacts:read", "tasks:read", "connectors:read", "audit:read"]
    if grant.access_level == "support_assist":
        permissions.extend(["contacts:assist", "tasks:assist", "messages:draft"])

    AuditService.log(
        db,
        workspace_id=grant.workspace_id,
        user=None,
        action_type="support_access_validate",
        target_type="support_access_grant",
        target_id=grant.id,
        metadata={"label": grant.label, "access_level": grant.access_level},
    )
    return SupportSessionOut(
        workspace_id=grant.workspace_id,
        grant_id=grant.id,
        label=grant.label,
        access_level=grant.access_level,
        expires_at=grant.expires_at,
        permissions=permissions,
    )

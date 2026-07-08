import hmac
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.schemas.admin import (
    SoftwareAdminOverview,
    SupportDraftRequest,
    SupportDraftResponse,
    SupportAccessCreateRequest,
    SupportAccessCreateResponse,
    SupportAccessGrantOut,
    SupportSessionOut,
    SupportWorkspaceSummary,
    WorkspaceAdminOverview,
)
from app.services.admin_service import SoftwareAdminService, WorkspaceAdminService
from app.services.audit_service import AuditService


workspace_router = APIRouter(prefix="/workspace-admin", tags=["workspace-admin"])
software_router = APIRouter(prefix="/software-admin", tags=["software-admin"])
support_router = APIRouter(prefix="/support", tags=["support"])


def _support_permissions(access_level: str) -> list[str]:
    permissions = ["workspace:read", "contacts:read", "tasks:read", "connectors:read", "audit:read"]
    if access_level == "support_assist":
        permissions.extend(["contacts:assist", "tasks:assist", "messages:draft"])
    return permissions


def _require_support_access(
    db: Session = Depends(get_db),
    x_support_access_token: str | None = Header(default=None),
):
    if not x_support_access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Support access token required.")
    try:
        return WorkspaceAdminService.validate_support_token(db, token=x_support_access_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


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
    grant=Depends(_require_support_access),
):
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
        permissions=_support_permissions(grant.access_level),
    )


@support_router.get("/workspace-summary", response_model=SupportWorkspaceSummary)
def support_workspace_summary(
    db: Session = Depends(get_db),
    grant=Depends(_require_support_access),
):
    overview = WorkspaceAdminService.overview(db, workspace_id=grant.workspace_id, current_role="support")
    connectors = overview["connectors"]
    needs_attention = [
        f"{connector['name']}: {connector['health'].get('last_error') or 'needs configuration'}"
        for connector in connectors
        if connector.get("status") != "ready"
    ]
    recommended_actions = needs_attention[:4] or ["Workspace connectors look ready. Review recent audit activity before assisting."]
    AuditService.log(
        db,
        workspace_id=grant.workspace_id,
        user=None,
        action_type="support_workspace_summary",
        target_type="support_access_grant",
        target_id=grant.id,
        metadata={"label": grant.label, "access_level": grant.access_level},
    )
    return SupportWorkspaceSummary(
        workspace_id=overview["workspace_id"],
        workspace_name=overview["workspace_name"],
        grant_id=grant.id,
        access_level=grant.access_level,
        metrics=overview["metrics"],
        connectors=connectors,
        audit_summary=overview["audit_summary"],
        recommended_actions=recommended_actions,
    )


@support_router.post("/draft-response", response_model=SupportDraftResponse)
def support_draft_response(
    payload: SupportDraftRequest,
    db: Session = Depends(get_db),
    grant=Depends(_require_support_access),
):
    if grant.access_level != "support_assist":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Support assist access is required to draft responses.")

    situation = f"\n\nContext: {payload.situation.strip()}" if payload.situation else ""
    draft = (
        "I can help with that. I am going to review the workspace status, connector health, and recent activity first, "
        "then I will suggest the safest next step before changing anything."
        f"\n\nUser issue: {payload.user_message.strip()}{situation}"
    )
    guardrails = [
        "No delete, send, import, sync, permission, or connector changes are allowed through support access.",
        "Ask a workspace admin to approve any risky or state-changing action.",
        "Only use information from the scoped workspace connected to this support token.",
    ]
    AuditService.log(
        db,
        workspace_id=grant.workspace_id,
        user=None,
        action_type="support_draft_response",
        target_type="support_access_grant",
        target_id=grant.id,
        metadata={"label": grant.label, "access_level": grant.access_level},
        prompt=payload.user_message,
    )
    return SupportDraftResponse(draft=draft, guardrails=guardrails)

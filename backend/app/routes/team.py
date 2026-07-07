import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.models import AppUser
from app.schemas.team import (
    InviteAcceptRequest,
    InviteAcceptResponse,
    InvitePreview,
    TeamInviteCreate,
    TeamInviteOut,
    TeamOverview,
    TeamRoleUpdate,
)
from app.services.audit_service import AuditService
from app.services.team_service import TeamService


router = APIRouter(prefix="/team", tags=["team"])


@router.get("", response_model=TeamOverview)
def list_team(context: WorkspaceContext = Depends(require_permission("members:read")), db: Session = Depends(get_db)):
    return TeamService.list_team(db, context.workspace_id, context.role)


@router.post("/invites", response_model=TeamInviteOut, status_code=201)
def create_invite(
    payload: TeamInviteCreate,
    context: WorkspaceContext = Depends(require_permission("members:invite")),
    db: Session = Depends(get_db),
):
    try:
        invite = TeamService.create_invite(
            db,
            workspace_id=context.workspace_id,
            invited_by=context.user,
            email=payload.email,
            role=payload.role,
        )
        AuditService.log(
            db,
            workspace_id=context.workspace_id,
            user=context.user,
            action_type="team_invite",
            target_type="workspace_invite",
            target_id=invite.id,
            metadata={"email": invite.invited_email, "role": invite.role},
        )
        return invite
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/members/{membership_id}/role", response_model=TeamOverview)
def update_member_role(
    membership_id: uuid.UUID,
    payload: TeamRoleUpdate,
    context: WorkspaceContext = Depends(require_permission("members:manage")),
    db: Session = Depends(get_db),
):
    try:
        TeamService.update_member_role(
            db,
            workspace_id=context.workspace_id,
            membership_id=membership_id,
            role=payload.role,
            actor_user_id=context.user.id,
        )
        return TeamService.list_team(db, context.workspace_id, context.role)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/members/{membership_id}", status_code=204)
def remove_member(
    membership_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_permission("members:manage")),
    db: Session = Depends(get_db),
):
    try:
        TeamService.remove_member(
            db,
            workspace_id=context.workspace_id,
            membership_id=membership_id,
            actor_user_id=context.user.id,
        )
        AuditService.log(
            db,
            workspace_id=context.workspace_id,
            user=context.user,
            action_type="team_member_remove",
            target_type="workspace_membership",
            target_id=membership_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/invites/{invite_id}", status_code=204)
def revoke_invite(
    invite_id: uuid.UUID,
    context: WorkspaceContext = Depends(require_permission("members:manage")),
    db: Session = Depends(get_db),
):
    try:
        TeamService.revoke_invite(db, workspace_id=context.workspace_id, invite_id=invite_id)
        AuditService.log(
            db,
            workspace_id=context.workspace_id,
            user=context.user,
            action_type="team_invite_revoke",
            target_type="workspace_invite",
            target_id=invite_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/invites/preview", response_model=InvitePreview)
def preview_invite(token: str, db: Session = Depends(get_db)):
    try:
        return TeamService.preview_invite(db, token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/invites/accept", response_model=InviteAcceptResponse)
def accept_invite(
    payload: InviteAcceptRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(current_user),
):
    try:
        membership = TeamService.accept_invite(db, token=payload.token, user=user)
        return InviteAcceptResponse(
            workspace_id=membership.workspace_id,
            role=membership.role,
            message="Invite accepted. Your workspace is ready.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

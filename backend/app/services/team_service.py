import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import ROLE_PERMISSIONS, VALID_ROLES
from app.models import AppUser, Workspace, WorkspaceInvite, WorkspaceMembership
from app.schemas.team import TeamInviteOut, TeamMemberOut, TeamOverview
from app.services.auth_service import AuthService
from app.services.email_service import EmailService


INVITE_TTL_DAYS = 14


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TeamService:
    @staticmethod
    def normalize_role(role: str) -> str:
        normalized = (role or "").strip().lower()
        if normalized not in VALID_ROLES:
            raise ValueError("Choose a valid team role.")
        return normalized

    @staticmethod
    def list_team(db: Session, workspace_id: uuid.UUID, current_role: str) -> TeamOverview:
        rows = (
            db.query(WorkspaceMembership, AppUser)
            .join(AppUser, AppUser.id == WorkspaceMembership.user_id)
            .filter(WorkspaceMembership.workspace_id == workspace_id)
            .order_by(WorkspaceMembership.created_at.asc())
            .all()
        )
        members = [
            TeamMemberOut(
                id=membership.id,
                user_id=user.id,
                workspace_id=membership.workspace_id,
                email=user.email,
                name=user.name,
                role=membership.role,
                status=membership.status,
                accepted_at=membership.accepted_at,
                created_at=membership.created_at,
            )
            for membership, user in rows
        ]
        invites = (
            db.query(WorkspaceInvite)
            .filter(WorkspaceInvite.workspace_id == workspace_id, WorkspaceInvite.status == "pending")
            .order_by(WorkspaceInvite.created_at.desc())
            .all()
        )
        permissions = ROLE_PERMISSIONS.get(current_role, set())
        return TeamOverview(
            members=members,
            invites=[TeamInviteOut.model_validate(invite) for invite in invites],
            current_role=current_role,
            permissions=sorted(permissions),
        )

    @staticmethod
    def create_invite(
        db: Session,
        *,
        workspace_id: uuid.UUID,
        invited_by: AppUser,
        email: str,
        role: str,
    ) -> WorkspaceInvite:
        normalized_email = AuthService.normalize_email(email)
        if not AuthService.validate_email(normalized_email):
            raise ValueError("Enter a valid email address.")
        normalized_role = TeamService.normalize_role(role)
        if normalized_role == "owner":
            raise ValueError("Add owners by promoting an active admin after they join.")

        existing_user = db.query(AppUser).filter(AppUser.email == normalized_email).first()
        if existing_user:
            existing_membership = (
                db.query(WorkspaceMembership)
                .filter(
                    WorkspaceMembership.workspace_id == workspace_id,
                    WorkspaceMembership.user_id == existing_user.id,
                    WorkspaceMembership.status == "active",
                )
                .first()
            )
            if existing_membership:
                raise ValueError("That person is already on this team.")

        now = _now()
        db.query(WorkspaceInvite).filter(
            WorkspaceInvite.workspace_id == workspace_id,
            WorkspaceInvite.invited_email == normalized_email,
            WorkspaceInvite.status == "pending",
        ).update({"status": "revoked"})

        token = secrets.token_urlsafe(32)
        invite = WorkspaceInvite(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            invited_email=normalized_email,
            role=normalized_role,
            token_hash=_token_hash(token),
            status="pending",
            invited_by_user_id=invited_by.id,
            expires_at=now + timedelta(days=INVITE_TTL_DAYS),
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)

        workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        invite_url = f"{settings.frontend_app_url.rstrip('/')}/accept-invite?token={quote(token)}"
        EmailService.send_team_invite(
            to_email=normalized_email,
            invited_by_name=invited_by.name,
            workspace_name=workspace.name if workspace else "Teifke / Relationships",
            role=normalized_role,
            invite_url=invite_url,
            idempotency_key=f"workspace-invite-{invite.id}",
        )
        return invite

    @staticmethod
    def invite_by_token(db: Session, token: str) -> WorkspaceInvite | None:
        return (
            db.query(WorkspaceInvite)
            .filter(WorkspaceInvite.token_hash == _token_hash(token))
            .first()
        )

    @staticmethod
    def preview_invite(db: Session, token: str) -> dict:
        invite = TeamService.invite_by_token(db, token)
        if not invite:
            raise ValueError("Invite link is invalid.")
        if invite.status != "pending":
            raise ValueError("Invite link has already been used or revoked.")
        expires_at = invite.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < _now():
            invite.status = "expired"
            db.commit()
            raise ValueError("Invite link has expired.")
        workspace = db.query(Workspace).filter(Workspace.id == invite.workspace_id).first()
        existing_user = db.query(AppUser).filter(AppUser.email == invite.invited_email).first()
        return {
            "email": invite.invited_email,
            "role": invite.role,
            "workspace_name": workspace.name if workspace else "Teifke / Relationships",
            "status": invite.status,
            "requires_account": existing_user is None,
        }

    @staticmethod
    def accept_invite(db: Session, *, token: str, user: AppUser) -> WorkspaceMembership:
        invite = TeamService.invite_by_token(db, token)
        if not invite:
            raise ValueError("Invite link is invalid.")
        if invite.status != "pending":
            raise ValueError("Invite link has already been used or revoked.")
        if AuthService.normalize_email(user.email) != invite.invited_email:
            raise ValueError("Sign in with the email address this invite was sent to.")
        expires_at = invite.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        now = _now()
        if expires_at < now:
            invite.status = "expired"
            db.commit()
            raise ValueError("Invite link has expired.")

        membership = (
            db.query(WorkspaceMembership)
            .filter(
                WorkspaceMembership.workspace_id == invite.workspace_id,
                WorkspaceMembership.user_id == user.id,
            )
            .first()
        )
        if not membership:
            membership = WorkspaceMembership(
                id=uuid.uuid4(),
                workspace_id=invite.workspace_id,
                user_id=user.id,
                role=invite.role,
                status="active",
                invited_by_user_id=invite.invited_by_user_id,
                invited_email=invite.invited_email,
                accepted_at=now,
            )
            db.add(membership)
        else:
            membership.role = invite.role
            membership.status = "active"
            membership.accepted_at = membership.accepted_at or now

        user.workspace_id = invite.workspace_id
        invite.status = "accepted"
        invite.accepted_by_user_id = user.id
        invite.accepted_at = now
        db.commit()
        db.refresh(membership)
        return membership

    @staticmethod
    def update_member_role(
        db: Session,
        *,
        workspace_id: uuid.UUID,
        membership_id: uuid.UUID,
        role: str,
        actor_user_id: uuid.UUID,
    ) -> WorkspaceMembership:
        normalized_role = TeamService.normalize_role(role)
        membership = (
            db.query(WorkspaceMembership)
            .filter(WorkspaceMembership.workspace_id == workspace_id, WorkspaceMembership.id == membership_id)
            .first()
        )
        if not membership:
            raise ValueError("Team member not found.")
        if membership.user_id == actor_user_id and membership.role == "owner" and normalized_role != "owner":
            raise ValueError("Owners cannot demote themselves.")
        if membership.role == "owner" and normalized_role != "owner":
            TeamService._ensure_another_owner(db, workspace_id, membership.user_id)
        membership.role = normalized_role
        db.commit()
        db.refresh(membership)
        return membership

    @staticmethod
    def remove_member(db: Session, *, workspace_id: uuid.UUID, membership_id: uuid.UUID, actor_user_id: uuid.UUID) -> None:
        membership = (
            db.query(WorkspaceMembership)
            .filter(WorkspaceMembership.workspace_id == workspace_id, WorkspaceMembership.id == membership_id)
            .first()
        )
        if not membership:
            raise ValueError("Team member not found.")
        if membership.user_id == actor_user_id:
            raise ValueError("You cannot remove yourself.")
        if membership.role == "owner":
            TeamService._ensure_another_owner(db, workspace_id, membership.user_id)
        membership.status = "disabled"
        db.commit()

    @staticmethod
    def revoke_invite(db: Session, *, workspace_id: uuid.UUID, invite_id: uuid.UUID) -> None:
        invite = (
            db.query(WorkspaceInvite)
            .filter(WorkspaceInvite.workspace_id == workspace_id, WorkspaceInvite.id == invite_id)
            .first()
        )
        if not invite:
            raise ValueError("Invite not found.")
        invite.status = "revoked"
        db.commit()

    @staticmethod
    def _ensure_another_owner(db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> None:
        owner_count = (
            db.query(WorkspaceMembership)
            .filter(
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.role == "owner",
                WorkspaceMembership.status == "active",
                WorkspaceMembership.user_id != user_id,
            )
            .count()
        )
        if owner_count == 0:
            raise ValueError("A workspace must keep at least one active owner.")

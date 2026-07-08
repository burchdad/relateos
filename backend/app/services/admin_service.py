import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AppUser,
    AssistantActionLog,
    ConnectorCredential,
    ContentItem,
    Deal,
    Event,
    FollowUpTask,
    Meeting,
    Person,
    Relationship,
    SupportAccessGrant,
    Workspace,
    WorkspaceMembership,
)
from app.schemas.admin import SupportAccessGrantOut, WorkspaceAuditLogOut, WorkspaceMetric, WorkspacePolicySettings
from app.services.connections_service import ConnectionsService
from app.services.system_settings_service import get_setting, upsert_setting
from app.services.team_service import TeamService


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class WorkspaceAdminService:
    POLICY_DEFAULTS = WorkspacePolicySettings().model_dump()

    @staticmethod
    def overview(db: Session, *, workspace_id: uuid.UUID, current_role: str) -> dict:
        workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        team = TeamService.list_team(db, workspace_id, current_role)
        connectors = ConnectionsService.overview(db, workspace_id)["connectors"]
        support_grants = WorkspaceAdminService.list_support_access(db, workspace_id=workspace_id)
        active_connectors = len([connector for connector in connectors if connector["status"] == "ready"])

        metrics = [
            WorkspaceMetric(label="Contacts", value=WorkspaceAdminService._count(db, Person, workspace_id)),
            WorkspaceMetric(label="Relationships", value=WorkspaceAdminService._count(db, Relationship, workspace_id)),
            WorkspaceMetric(label="Open tasks", value=WorkspaceAdminService._count(db, FollowUpTask, workspace_id, FollowUpTask.status != "completed")),
            WorkspaceMetric(label="Events", value=WorkspaceAdminService._count(db, Event, workspace_id)),
            WorkspaceMetric(label="Content items", value=WorkspaceAdminService._count(db, ContentItem, workspace_id)),
            WorkspaceMetric(label="Meetings", value=WorkspaceAdminService._count(db, Meeting, workspace_id)),
            WorkspaceMetric(label="Deals", value=WorkspaceAdminService._count(db, Deal, workspace_id)),
            WorkspaceMetric(label="Connectors ready", value=f"{active_connectors}/{len(connectors)}"),
        ]

        audit_rows = (
            db.query(AssistantActionLog.action_type, func.count(AssistantActionLog.id))
            .filter(AssistantActionLog.workspace_id == workspace_id)
            .group_by(AssistantActionLog.action_type)
            .order_by(func.count(AssistantActionLog.id).desc())
            .limit(6)
            .all()
        )
        audit_summary = [
            WorkspaceMetric(label=str(action_type).replace("_", " ").title(), value=int(count))
            for action_type, count in audit_rows
        ]

        return {
            "workspace_id": workspace_id,
            "workspace_name": workspace.name if workspace else "Workspace",
            "current_role": current_role,
            "metrics": [metric.model_dump() for metric in metrics],
            "team_members": team.members,
            "pending_invites": team.invites,
            "connectors": connectors,
            "support_access": support_grants,
            "audit_summary": [metric.model_dump() for metric in audit_summary],
        }

    @staticmethod
    def list_support_access(db: Session, *, workspace_id: uuid.UUID) -> list[SupportAccessGrantOut]:
        rows = (
            db.query(SupportAccessGrant)
            .filter(SupportAccessGrant.workspace_id == workspace_id)
            .order_by(SupportAccessGrant.created_at.desc())
            .limit(25)
            .all()
        )
        return [SupportAccessGrantOut.model_validate(row) for row in rows]

    @staticmethod
    def create_support_access(
        db: Session,
        *,
        workspace_id: uuid.UUID,
        created_by: AppUser,
        label: str,
        access_level: str,
        expires_in_hours: int,
    ) -> tuple[SupportAccessGrant, str]:
        normalized_access = access_level if access_level in {"support_read", "support_assist"} else "support_read"
        token = f"rso_support_{secrets.token_urlsafe(32)}"
        grant = SupportAccessGrant(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            label=label.strip(),
            token_hash=_token_hash(token),
            status="active",
            access_level=normalized_access,
            created_by_user_id=created_by.id,
            expires_at=_now() + timedelta(hours=expires_in_hours),
            metadata_json={"created_by_email": created_by.email},
        )
        db.add(grant)
        db.commit()
        db.refresh(grant)
        return grant, token

    @staticmethod
    def revoke_support_access(db: Session, *, workspace_id: uuid.UUID, grant_id: uuid.UUID) -> None:
        grant = (
            db.query(SupportAccessGrant)
            .filter(SupportAccessGrant.workspace_id == workspace_id, SupportAccessGrant.id == grant_id)
            .first()
        )
        if not grant:
            raise ValueError("Support access grant not found.")
        grant.status = "revoked"
        grant.revoked_at = _now()
        db.commit()

    @staticmethod
    def audit_logs(db: Session, *, workspace_id: uuid.UUID, limit: int = 50) -> list[WorkspaceAuditLogOut]:
        capped_limit = max(1, min(limit, 100))
        rows = (
            db.query(AssistantActionLog, AppUser)
            .outerjoin(AppUser, AssistantActionLog.user_id == AppUser.id)
            .filter(AssistantActionLog.workspace_id == workspace_id)
            .order_by(AssistantActionLog.created_at.desc())
            .limit(capped_limit)
            .all()
        )
        return [
            WorkspaceAuditLogOut(
                id=log.id,
                action_type=log.action_type,
                status=log.status,
                prompt=log.prompt,
                target_type=log.target_type,
                target_id=log.target_id,
                metadata_json=log.metadata_json or {},
                created_at=log.created_at,
                user_id=log.user_id,
                user_name=user.name if user else None,
                user_email=user.email if user else None,
            )
            for log, user in rows
        ]

    @staticmethod
    def policy_settings(db: Session, *, workspace_id: uuid.UUID) -> WorkspacePolicySettings:
        key = WorkspaceAdminService._policy_key(workspace_id)
        value = get_setting(db, key, WorkspaceAdminService.POLICY_DEFAULTS)
        merged = {**WorkspaceAdminService.POLICY_DEFAULTS, **value}
        return WorkspacePolicySettings.model_validate(merged)

    @staticmethod
    def update_policy_settings(db: Session, *, workspace_id: uuid.UUID, payload: WorkspacePolicySettings) -> WorkspacePolicySettings:
        key = WorkspaceAdminService._policy_key(workspace_id)
        upsert_setting(db, key, payload.model_dump())
        return WorkspaceAdminService.policy_settings(db, workspace_id=workspace_id)

    @staticmethod
    def validate_support_token(db: Session, *, token: str) -> SupportAccessGrant:
        grant = db.query(SupportAccessGrant).filter(SupportAccessGrant.token_hash == _token_hash(token)).first()
        if not grant:
            raise ValueError("Support access token is invalid.")
        if grant.status != "active":
            raise ValueError("Support access token is not active.")
        if grant.expires_at <= _now():
            grant.status = "expired"
            db.commit()
            raise ValueError("Support access token has expired.")
        grant.last_used_at = _now()
        db.commit()
        db.refresh(grant)
        return grant

    @staticmethod
    def _policy_key(workspace_id: uuid.UUID) -> str:
        return f"workspace:{workspace_id}:admin_policy"

    @staticmethod
    def _count(db: Session, model, workspace_id: uuid.UUID, *filters) -> int:
        query = db.query(model).filter(model.workspace_id == workspace_id)
        for filter_item in filters:
            query = query.filter(filter_item)
        return int(query.count())


class SoftwareAdminService:
    @staticmethod
    def overview(db: Session) -> dict:
        workspaces = db.query(Workspace).order_by(Workspace.created_at.desc()).limit(100).all()
        summaries = []
        for workspace in workspaces:
            connector_rows = (
                db.query(ConnectorCredential)
                .filter(ConnectorCredential.workspace_id == workspace.id)
                .all()
            )
            ready = 0
            for row in connector_rows:
                if ConnectionsService.connector_status(db, row.connector_key, workspace.id)["status"] == "ready":
                    ready += 1
            summaries.append(
                {
                    "workspace_id": workspace.id,
                    "workspace_name": workspace.name,
                    "owner_user_id": workspace.owner_user_id,
                    "members": db.query(WorkspaceMembership).filter(WorkspaceMembership.workspace_id == workspace.id).count(),
                    "contacts": db.query(Person).filter(Person.workspace_id == workspace.id).count(),
                    "connectors_ready": ready,
                    "support_grants_active": db.query(SupportAccessGrant).filter(
                        SupportAccessGrant.workspace_id == workspace.id,
                        SupportAccessGrant.status == "active",
                        SupportAccessGrant.expires_at > _now(),
                    ).count(),
                    "created_at": workspace.created_at,
                }
            )
        return {"workspaces": summaries, "software_admin_enabled": True}

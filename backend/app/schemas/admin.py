from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.connections import ConnectorStatus
from app.schemas.team import TeamInviteOut, TeamMemberOut


class WorkspaceMetric(BaseModel):
    label: str
    value: int | str
    detail: str | None = None


class SupportAccessGrantOut(BaseModel):
    id: UUID
    workspace_id: UUID
    label: str
    status: str
    access_level: str
    expires_at: datetime
    revoked_at: datetime | None = None
    last_used_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SupportAccessCreateRequest(BaseModel):
    label: str = Field(default="Support helper", min_length=2, max_length=255)
    access_level: str = Field(default="support_read", max_length=40)
    expires_in_hours: int = Field(default=24, ge=1, le=168)


class SupportAccessCreateResponse(BaseModel):
    grant: SupportAccessGrantOut
    token: str
    message: str


class SupportSessionOut(BaseModel):
    workspace_id: UUID
    grant_id: UUID
    label: str
    access_level: str
    expires_at: datetime
    permissions: list[str]


class WorkspaceAdminOverview(BaseModel):
    workspace_id: UUID
    workspace_name: str
    current_role: str
    metrics: list[WorkspaceMetric]
    team_members: list[TeamMemberOut]
    pending_invites: list[TeamInviteOut]
    connectors: list[ConnectorStatus]
    support_access: list[SupportAccessGrantOut]
    audit_summary: list[WorkspaceMetric]


class SoftwareWorkspaceSummary(BaseModel):
    workspace_id: UUID
    workspace_name: str
    owner_user_id: UUID | None = None
    members: int
    contacts: int
    connectors_ready: int
    support_grants_active: int
    created_at: datetime


class SoftwareAdminOverview(BaseModel):
    workspaces: list[SoftwareWorkspaceSummary]
    software_admin_enabled: bool

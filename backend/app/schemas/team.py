from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TeamMemberOut(BaseModel):
    id: UUID
    user_id: UUID
    workspace_id: UUID
    email: str
    name: str
    role: str
    status: str
    accepted_at: datetime | None = None
    created_at: datetime


class TeamInviteOut(BaseModel):
    id: UUID
    workspace_id: UUID
    invited_email: str
    role: str
    status: str
    expires_at: datetime
    accepted_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamOverview(BaseModel):
    members: list[TeamMemberOut]
    invites: list[TeamInviteOut]
    current_role: str
    permissions: list[str]


class TeamInviteCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    role: str = Field(default="member", max_length=40)


class TeamRoleUpdate(BaseModel):
    role: str = Field(max_length=40)


class InvitePreview(BaseModel):
    email: str
    role: str
    workspace_name: str
    status: str
    requires_account: bool = False


class InviteAcceptRequest(BaseModel):
    token: str = Field(min_length=20, max_length=255)


class InviteAcceptResponse(BaseModel):
    workspace_id: UUID
    role: str
    message: str

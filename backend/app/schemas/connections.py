from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ConnectorKey = Literal["skool", "zoom", "google_calendar", "read_ai", "openai"]
SyncMode = Literal["archive", "live_session", "full"]


class ConnectorCredentialField(BaseModel):
    key: str
    label: str
    secret: bool = True
    required: bool = True
    placeholder: str = ""


class ConnectorStatus(BaseModel):
    key: ConnectorKey
    name: str
    status: Literal["ready", "needs_config", "partial"]
    purpose: str
    fields: list[ConnectorCredentialField]
    configured_fields: list[str]
    missing_fields: list[str]
    last_updated_at: datetime | None = None


class ConnectorUpdateRequest(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


class ConnectorUpdateResponse(BaseModel):
    connector: ConnectorStatus
    message: str


class OAuthStartResponse(BaseModel):
    auth_url: str


class AgentSyncRequest(BaseModel):
    mode: SyncMode = "full"


class AgentSyncResponse(BaseModel):
    job_id: str
    status: Literal["queued", "needs_config", "completed", "partial"]
    mode: SyncMode
    message: str
    pipeline: list[str]
    blockers: list[str]
    requested_at: datetime
    imported_content_count: int = 0
    imported_meeting_count: int = 0
    imported_attendee_count: int = 0
    imported_artifact_count: int = 0
    errors: list[str] = Field(default_factory=list)


class ConnectionsOverview(BaseModel):
    connectors: list[ConnectorStatus]
    pipeline: list[str]
    recommended_next_step: str

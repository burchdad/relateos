from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RecordingArtifactCreate(BaseModel):
    artifact_type: str
    file_name: str | None = None
    content_type: str | None = None
    source_url: str | None = None
    text_content: str | None = None
    file_size_bytes: int = 0
    status: str = "ready"
    extraction_notes: list[str] = Field(default_factory=list)
    raw_metadata: dict = Field(default_factory=dict)


class RecordingArtifactOut(BaseModel):
    id: UUID
    meeting_id: UUID
    artifact_type: str
    file_name: str | None
    content_type: str | None
    source_url: str | None
    text_content: str | None
    file_size_bytes: int
    status: str
    extraction_notes: list
    raw_metadata: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecordingArtifactSummary(BaseModel):
    total: int
    ready_text: int
    pending_transcription: int
    media: int
    text_characters: int


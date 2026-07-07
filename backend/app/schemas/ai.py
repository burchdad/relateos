from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StyleProfilePayload(BaseModel):
    tone: str = "casual"
    length: str = "short"
    energy: str = "medium"
    emoji_usage: str = "low"


class MessageSuggestionRequest(BaseModel):
    goal: str
    style_profile: StyleProfilePayload | None = None


class AIResponse(BaseModel):
    content: str


class AssistantChatMessage(BaseModel):
    role: str
    content: str


class AssistantRequest(BaseModel):
    message: str
    history: list[AssistantChatMessage] = Field(default_factory=list)


class AssistantAction(BaseModel):
    type: str
    label: str
    status: str = "completed"
    href: str | None = None
    metadata: dict = Field(default_factory=dict)


class AssistantResponse(BaseModel):
    reply: str
    actions: list[AssistantAction] = Field(default_factory=list)
    navigate_to: str | None = None


class AssistantActionLogOut(BaseModel):
    id: UUID
    action_type: str
    status: str
    prompt: str | None = None
    target_type: str | None = None
    target_id: UUID | None = None
    metadata_json: dict = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}

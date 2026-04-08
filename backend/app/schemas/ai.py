from pydantic import BaseModel


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

from pydantic import BaseModel


class MessageSuggestionRequest(BaseModel):
    goal: str


class AIResponse(BaseModel):
    content: str

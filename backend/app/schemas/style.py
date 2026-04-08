from pydantic import BaseModel


class StyleProfileRequest(BaseModel):
    tone: str = "casual"
    length: str = "short"
    energy: str = "medium"
    emoji_usage: str = "low"


class StyleProfileResponse(StyleProfileRequest):
    owner_user_id: str

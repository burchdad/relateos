from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=3)
    event_type: Literal["weekly", "monthly", "one-time"]
    event_url: str = Field(min_length=4)
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    time_of_day: str = Field(min_length=2, max_length=50)
    owner_user_id: str | None = None


class EventOut(BaseModel):
    id: UUID
    title: str
    description: str
    event_type: str
    event_url: str
    day_of_week: int | None
    time_of_day: str
    owner_user_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

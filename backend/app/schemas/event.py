from datetime import date, datetime
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
    calendar_start_date: date | None = None
    add_to_calendar: bool = False
    owner_user_id: str | None = None


class EventAttendeeOut(BaseModel):
    id: UUID
    contact_id: UUID | None = None
    name: str | None = None
    email: str | None = None
    attendance_status: str

    model_config = {"from_attributes": True}


class EventOut(BaseModel):
    id: UUID
    title: str
    description: str
    event_type: str
    event_url: str
    day_of_week: int | None
    time_of_day: str
    calendar_start_date: date | None = None
    calendar_event_id: str | None = None
    calendar_event_url: str | None = None
    calendar_sync_status: str | None = None
    calendar_sync_error: str | None = None
    owner_user_id: str | None
    attendees: list["EventAttendeeOut"] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class EventInviteSendRequest(BaseModel):
    contact_ids: list[UUID] = Field(min_length=1, max_length=500)


class EventInviteSendResponse(BaseModel):
    sent: int
    skipped: list[UUID] = Field(default_factory=list)

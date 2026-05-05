from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MeetingAttendeeCreate(BaseModel):
    contact_id: UUID | None = None
    name: str | None = None
    email: str | None = None
    attendance_status: str = "attended"
    joined_at: datetime | None = None
    left_at: datetime | None = None
    duration_seconds: int = 0


class MeetingAttendeeOut(BaseModel):
    id: UUID
    meeting_id: UUID
    contact_id: UUID | None
    name: str | None
    email: str | None
    attendance_status: str
    joined_at: datetime | None
    left_at: datetime | None
    duration_seconds: int
    followup_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MeetingCreate(BaseModel):
    title: str
    platform: str | None = None
    meeting_url: str | None = None
    scheduled_at: datetime | None = None
    transcript: str | None = None


class MeetingUpdate(BaseModel):
    title: str | None = None
    platform: str | None = None
    meeting_url: str | None = None
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    transcript: str | None = None
    summary: str | None = None
    action_items: list | None = None


class MeetingOut(BaseModel):
    id: UUID
    title: str
    platform: str | None
    meeting_url: str | None
    scheduled_at: datetime | None
    started_at: datetime | None
    ended_at: datetime | None
    transcript: str | None
    summary: str | None
    action_items: list
    attendees: list[MeetingAttendeeOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AttendeeImportRow(BaseModel):
    name: str | None = None
    email: str | None = None
    attendance_status: str = "attended"
    duration_seconds: int = 0


class AttendeeImportRequest(BaseModel):
    rows: list[AttendeeImportRow]
    auto_create_contacts: bool = True


class MeetingFollowUpResponse(BaseModel):
    meeting_id: UUID
    summary: str
    action_items: list[str]
    followup_drafts: list[dict]
    contacts_to_create: list[dict]
    deal_opportunities: list[dict]

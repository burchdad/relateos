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
    source_provider: str | None = None
    external_meeting_id: str | None = None
    raw_report: dict = Field(default_factory=dict)
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


class InviteAttendeeIn(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None


class InboundInviteRequest(BaseModel):
    provider: str | None = None
    source_mailbox: str | None = None
    subject: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    event_title: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    meeting_url: str | None = None
    platform: str | None = None
    description: str | None = None
    ical_text: str | None = None
    attendees: list[InviteAttendeeIn] = Field(default_factory=list)
    auto_create_contacts: bool = True
    raw_payload: dict = Field(default_factory=dict)


class InboundInviteResponse(BaseModel):
    meeting_id: UUID
    title: str
    platform: str | None = None
    meeting_url: str | None = None
    attendees_added: int
    contacts_created: int
    engagement_event_id: str | None = None


class MeetingReportParticipant(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None
    talk_time_seconds: int | None = None


class MeetingActionItemIn(BaseModel):
    text: str
    owner_name: str | None = None
    owner_email: str | None = None
    due_date: str | None = None
    status: str | None = None


class MeetingIntelligenceReportRequest(BaseModel):
    provider: str = "read_ai"
    external_meeting_id: str | None = None
    title: str
    platform: str | None = None
    meeting_url: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    summary: str | None = None
    transcript: str | None = None
    action_items: list[MeetingActionItemIn] = Field(default_factory=list)
    participants: list[MeetingReportParticipant] = Field(default_factory=list)
    raw_payload: dict = Field(default_factory=dict)
    auto_create_contacts: bool = True


class MeetingIntelligenceReportResponse(BaseModel):
    meeting_id: UUID
    attendees_added: int
    contacts_created: int
    action_items_created: int
    relationship_edges_created: int

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.orm import Session

from app.models import Event
from app.services.connections_service import ConnectionsService


TIME_ZONE = "America/Chicago"


class GoogleCalendarService:
    @staticmethod
    def list_events_for_workspace(
        db: Session,
        *,
        workspace_id: UUID,
        days_back: int = 30,
        days_forward: int = 90,
        max_results: int = 100,
    ) -> list[dict[str, Any]]:
        access_token = ConnectionsService.stored_connector_value(db, "google_calendar", "access_token", workspace_id)
        refresh_token = ConnectionsService.stored_connector_value(db, "google_calendar", "refresh_token", workspace_id)
        calendar_id = ConnectionsService.stored_connector_value(db, "google_calendar", "calendar_id", workspace_id) or "primary"

        if not access_token and refresh_token:
            access_token = ConnectionsService.refresh_oauth_token(db, "google_calendar", workspace_id)
        if not access_token:
            raise ValueError("Google Calendar is not connected for this workspace.")

        response = GoogleCalendarService._get_events(calendar_id, access_token, days_back, days_forward, max_results)
        if response.status_code == 401 and refresh_token:
            access_token = ConnectionsService.refresh_oauth_token(db, "google_calendar", workspace_id)
            response = GoogleCalendarService._get_events(calendar_id, access_token, days_back, days_forward, max_results)

        if response.status_code == 403:
            raise ValueError("Reconnect Google to approve Calendar read access before syncing meeting attendees.")
        response.raise_for_status()
        return response.json().get("items", [])

    @staticmethod
    def create_event_for_workspace(db: Session, *, event: Event, workspace_id: UUID) -> dict[str, Any]:
        access_token = ConnectionsService.stored_connector_value(db, "google_calendar", "access_token", workspace_id)
        refresh_token = ConnectionsService.stored_connector_value(db, "google_calendar", "refresh_token", workspace_id)
        calendar_id = ConnectionsService.stored_connector_value(db, "google_calendar", "calendar_id", workspace_id) or "primary"

        if not access_token and refresh_token:
            access_token = ConnectionsService.refresh_oauth_token(db, "google_calendar", workspace_id)
        if not access_token:
            raise ValueError("Google Calendar is not connected for this workspace.")

        payload = GoogleCalendarService._event_payload(event)
        response = GoogleCalendarService._post_event(calendar_id, access_token, payload)
        if response.status_code == 401 and refresh_token:
            access_token = ConnectionsService.refresh_oauth_token(db, "google_calendar", workspace_id)
            response = GoogleCalendarService._post_event(calendar_id, access_token, payload)

        response.raise_for_status()
        data = response.json()
        return {
            "id": data.get("id"),
            "htmlLink": data.get("htmlLink"),
            "status": data.get("status"),
        }

    @staticmethod
    def _get_events(calendar_id: str, access_token: str, days_back: int, days_forward: int, max_results: int) -> httpx.Response:
        now = datetime.now(timezone.utc)
        params = {
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": str(max(1, min(max_results, 250))),
            "timeMin": (now - timedelta(days=days_back)).isoformat().replace("+00:00", "Z"),
            "timeMax": (now + timedelta(days=days_forward)).isoformat().replace("+00:00", "Z"),
        }
        return httpx.get(
            f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            params=params,
            timeout=20,
        )

    @staticmethod
    def _post_event(calendar_id: str, access_token: str, payload: dict[str, Any]) -> httpx.Response:
        return httpx.post(
            f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )

    @staticmethod
    def _event_payload(event: Event) -> dict[str, Any]:
        starts_at = GoogleCalendarService._start_datetime(event)
        ends_at = starts_at + timedelta(hours=1)
        payload: dict[str, Any] = {
            "summary": event.title,
            "description": "\n".join(part for part in [event.description, f"Link: {event.event_url}"] if part),
            "location": event.event_url,
            "start": {"dateTime": starts_at.isoformat(), "timeZone": TIME_ZONE},
            "end": {"dateTime": ends_at.isoformat(), "timeZone": TIME_ZONE},
        }
        if event.event_type == "weekly":
            payload["recurrence"] = ["RRULE:FREQ=WEEKLY"]
        elif event.event_type == "monthly":
            payload["recurrence"] = ["RRULE:FREQ=MONTHLY"]
        return payload

    @staticmethod
    def _start_datetime(event: Event) -> datetime:
        start_date = event.calendar_start_date or date.today()
        if event.event_type != "one-time" and event.day_of_week is not None:
            current_ui_day = (start_date.weekday() + 1) % 7
            offset = (int(event.day_of_week) - current_ui_day + 7) % 7
            start_date = start_date + timedelta(days=offset)
        parsed_time = GoogleCalendarService._parse_time(event.time_of_day)
        return datetime.combine(start_date, parsed_time, tzinfo=ZoneInfo(TIME_ZONE))

    @staticmethod
    def _parse_time(value: str) -> time:
        match = re.match(r"^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*$", value or "", re.IGNORECASE)
        if not match:
            return time(hour=12, minute=0)
        hour = max(0, min(23, int(match.group(1))))
        minute = max(0, min(59, int(match.group(2) or "0")))
        meridiem = (match.group(3) or "").upper()
        if meridiem == "PM" and hour < 12:
            hour += 12
        if meridiem == "AM" and hour == 12:
            hour = 0
        return time(hour=hour, minute=minute)

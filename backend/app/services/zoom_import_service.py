import base64
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from app.models import ContentItem
from app.schemas.content import ContentCreate
from app.schemas.meeting import MeetingIntelligenceReportRequest, MeetingReportParticipant
from app.services.connections_service import ConnectionsService
from app.services.content_service import ContentService
from app.services.meeting_service import MeetingService


ZOOM_API_BASE = "https://api.zoom.us/v2"
ZOOM_TOKEN_URL = "https://zoom.us/oauth/token"


class ZoomImportService:
    @staticmethod
    def import_recent_recordings(db: Session, days: int = 30) -> dict:
        credentials = ZoomImportService._credentials(db)
        missing = [key for key in ["account_id", "client_id", "client_secret"] if not credentials.get(key)]
        if missing:
            return {
                "imported_content_count": 0,
                "imported_meeting_count": 0,
                "imported_attendee_count": 0,
                "errors": [f"Missing Zoom credentials: {', '.join(missing)}"],
            }

        errors: list[str] = []
        imported_content = 0
        imported_meetings = 0
        imported_attendees = 0

        try:
            token = ZoomImportService._access_token(credentials)
        except Exception as exc:
            return {
                "imported_content_count": 0,
                "imported_meeting_count": 0,
                "imported_attendee_count": 0,
                "errors": [f"Zoom token request failed: {exc}"],
            }

        to_date = date.today()
        from_date = to_date - timedelta(days=min(days, 30))
        user_id = credentials.get("recording_user_id") or "me"

        try:
            recordings = ZoomImportService._list_recordings(token, user_id, from_date, to_date)
        except Exception as exc:
            return {
                "imported_content_count": 0,
                "imported_meeting_count": 0,
                "imported_attendee_count": 0,
                "errors": [f"Zoom recording import failed: {exc}"],
            }

        for recording in recordings:
            source_url = ZoomImportService._recording_url(recording)
            if source_url and not ZoomImportService._content_exists(db, source_url):
                ContentService.create_content_item(
                    db,
                    ContentCreate(
                        title=ZoomImportService._title(recording),
                        description=ZoomImportService._description(recording),
                        source_type="zoom",
                        source_url=source_url,
                    ),
                )
                imported_content += 1

            participants: list[MeetingReportParticipant] = []
            try:
                participants = ZoomImportService._participants(token, recording)
            except Exception as exc:
                errors.append(f"Participant report unavailable for {recording.get('topic') or recording.get('id')}: {exc}")

            response = MeetingService.ingest_intelligence_report(
                db,
                MeetingIntelligenceReportRequest(
                    provider="zoom",
                    external_meeting_id=str(recording.get("uuid") or recording.get("id") or ""),
                    title=ZoomImportService._title(recording),
                    platform="zoom",
                    meeting_url=source_url,
                    started_at=ZoomImportService._parse_zoom_time(recording.get("start_time")),
                    ended_at=ZoomImportService._ended_at(recording),
                    summary="Imported from Zoom cloud recordings.",
                    transcript=None,
                    participants=participants,
                    raw_payload={
                        "source": "zoom_recording_import",
                        "recording": recording,
                    },
                    auto_create_contacts=True,
                ),
            )
            imported_meetings += 1
            imported_attendees += response.attendees_added

        return {
            "imported_content_count": imported_content,
            "imported_meeting_count": imported_meetings,
            "imported_attendee_count": imported_attendees,
            "errors": errors,
        }

    @staticmethod
    def _credentials(db: Session) -> dict[str, str]:
        return {
            "account_id": ConnectionsService.stored_connector_value(db, "zoom", "account_id"),
            "client_id": ConnectionsService.stored_connector_value(db, "zoom", "client_id"),
            "client_secret": ConnectionsService.stored_connector_value(db, "zoom", "client_secret"),
            "recording_user_id": ConnectionsService.stored_connector_value(db, "zoom", "recording_user_id"),
        }

    @staticmethod
    def _access_token(credentials: dict[str, str]) -> str:
        auth = base64.b64encode(f"{credentials['client_id']}:{credentials['client_secret']}".encode()).decode()
        response = httpx.post(
            ZOOM_TOKEN_URL,
            params={"grant_type": "account_credentials", "account_id": credentials["account_id"]},
            headers={"Authorization": f"Basic {auth}"},
            timeout=20,
        )
        if response.status_code >= 400:
            raise RuntimeError(ZoomImportService._error_text(response))
        payload = response.json()
        token = payload.get("access_token")
        if not token:
            raise RuntimeError("Zoom did not return an access token.")
        return str(token)

    @staticmethod
    def _list_recordings(token: str, user_id: str, from_date: date, to_date: date) -> list[dict[str, Any]]:
        response = httpx.get(
            f"{ZOOM_API_BASE}/users/{user_id}/recordings",
            params={
                "from": from_date.isoformat(),
                "to": to_date.isoformat(),
                "page_size": 100,
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if response.status_code >= 400 and user_id == "me":
            user_id = ZoomImportService._first_user_id(token)
            response = httpx.get(
                f"{ZOOM_API_BASE}/users/{user_id}/recordings",
                params={
                    "from": from_date.isoformat(),
                    "to": to_date.isoformat(),
                    "page_size": 100,
                },
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
        if response.status_code >= 400:
            raise RuntimeError(ZoomImportService._error_text(response))
        return response.json().get("meetings", [])

    @staticmethod
    def _first_user_id(token: str) -> str:
        response = httpx.get(
            f"{ZOOM_API_BASE}/users",
            params={"page_size": 1, "status": "active"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        if response.status_code >= 400:
            raise RuntimeError(ZoomImportService._error_text(response))
        users = response.json().get("users", [])
        if not users:
            raise RuntimeError("No active Zoom users were returned.")
        return str(users[0].get("id") or users[0].get("email"))

    @staticmethod
    def _participants(token: str, recording: dict[str, Any]) -> list[MeetingReportParticipant]:
        meeting_id = recording.get("uuid") or recording.get("id")
        if not meeting_id:
            return []
        response = httpx.get(
            f"{ZOOM_API_BASE}/report/meetings/{quote(str(meeting_id), safe='')}/participants",
            params={"page_size": 100},
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeError(ZoomImportService._error_text(response))
        participants = []
        for row in response.json().get("participants", []):
            participants.append(
                MeetingReportParticipant(
                    name=row.get("name") or row.get("user_name"),
                    email=row.get("user_email") or row.get("email"),
                    talk_time_seconds=row.get("duration"),
                )
            )
        return participants

    @staticmethod
    def _content_exists(db: Session, source_url: str) -> bool:
        return db.query(ContentItem).filter(ContentItem.source_url == source_url).first() is not None

    @staticmethod
    def _recording_url(recording: dict[str, Any]) -> str:
        share_url = recording.get("share_url")
        if share_url:
            return str(share_url)
        files = recording.get("recording_files") or []
        for file in files:
            if file.get("play_url"):
                return str(file["play_url"])
            if file.get("download_url"):
                return str(file["download_url"])
        return ""

    @staticmethod
    def _title(recording: dict[str, Any]) -> str:
        topic = recording.get("topic") or "Zoom Recording"
        started = ZoomImportService._parse_zoom_time(recording.get("start_time"))
        if started:
            return f"{topic} - {started.date().isoformat()}"
        return str(topic)

    @staticmethod
    def _description(recording: dict[str, Any]) -> str:
        file_count = len(recording.get("recording_files") or [])
        return (
            "Imported automatically from Zoom cloud recordings.\n\n"
            f"Meeting ID: {recording.get('id') or 'unknown'}\n"
            f"Started: {recording.get('start_time') or 'unknown'}\n"
            f"Recording files: {file_count}"
        )

    @staticmethod
    def _parse_zoom_time(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return None

    @staticmethod
    def _ended_at(recording: dict[str, Any]) -> datetime | None:
        started = ZoomImportService._parse_zoom_time(recording.get("start_time"))
        duration = recording.get("duration")
        if started and isinstance(duration, int):
            return started + timedelta(minutes=duration)
        return None

    @staticmethod
    def _error_text(response: httpx.Response) -> str:
        try:
            payload = response.json()
            message = payload.get("message") or payload.get("reason") or str(payload)
        except Exception:
            message = response.text[:300]
        return f"{response.status_code} {message}"

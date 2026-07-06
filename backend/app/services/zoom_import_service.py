import base64
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from app.models import ContentItem, RecordingArtifact
from app.schemas.content import ContentCreate
from app.schemas.meeting import MeetingIntelligenceReportRequest, MeetingReportParticipant
from app.schemas.recording_artifact import RecordingArtifactCreate
from app.services.connections_service import ConnectionsService
from app.services.content_service import ContentService
from app.services.meeting_service import MeetingService
from app.services.recording_artifact_service import RecordingArtifactService


ZOOM_API_BASE = "https://api.zoom.us/v2"
ZOOM_TOKEN_URL = "https://zoom.us/oauth/token"


class ZoomImportService:
    @staticmethod
    def import_recent_recordings(db: Session, days: int = 365, workspace_id=None) -> dict:
        credentials = ZoomImportService._credentials(db, workspace_id)
        if not ZoomImportService._has_usable_credentials(credentials):
            return {
                "imported_content_count": 0,
                "imported_meeting_count": 0,
                "imported_attendee_count": 0,
                "imported_artifact_count": 0,
                "recordings_found_count": 0,
                "errors": ["Missing Zoom OAuth connection or legacy server-to-server credentials."],
            }

        errors: list[str] = []
        imported_content = 0
        imported_meetings = 0
        imported_attendees = 0
        imported_artifacts = 0
        recordings_found = 0

        try:
            token = ZoomImportService._access_token(db, credentials, workspace_id)
        except Exception as exc:
            return {
                "imported_content_count": 0,
                "imported_meeting_count": 0,
                "imported_attendee_count": 0,
                "imported_artifact_count": 0,
                "recordings_found_count": 0,
                "errors": [f"Zoom token request failed: {exc}"],
            }

        to_date = date.today()
        oldest_date = to_date - timedelta(days=max(days, 1))
        user_id = credentials.get("recording_user_id") or "me"

        try:
            recordings = ZoomImportService._list_recordings_windowed(token, user_id, oldest_date, to_date)
            recordings_found = len(recordings)
        except Exception as exc:
            return {
                "imported_content_count": 0,
                "imported_meeting_count": 0,
                "imported_attendee_count": 0,
                "imported_artifact_count": 0,
                "recordings_found_count": 0,
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
            try:
                imported_artifacts += ZoomImportService._import_recording_files(
                    db,
                    token=token,
                    meeting_id=response.meeting_id,
                    recording=recording,
                )
            except Exception as exc:
                errors.append(f"Recording file import failed for {recording.get('topic') or recording.get('id')}: {exc}")

        return {
            "imported_content_count": imported_content,
            "imported_meeting_count": imported_meetings,
            "imported_attendee_count": imported_attendees,
            "imported_artifact_count": imported_artifacts,
            "recordings_found_count": recordings_found,
            "errors": errors,
        }

    @staticmethod
    def import_recording_payload(db: Session, recording: dict[str, Any], workspace_id=None) -> dict:
        credentials = ZoomImportService._credentials(db, workspace_id)
        if not ZoomImportService._has_usable_credentials(credentials):
            return {
                "imported_content_count": 0,
                "imported_meeting_count": 0,
                "imported_attendee_count": 0,
                "imported_artifact_count": 0,
                "errors": ["Missing Zoom OAuth connection or legacy server-to-server credentials."],
            }
        token = ZoomImportService._access_token(db, credentials, workspace_id)
        source_url = ZoomImportService._recording_url(recording)
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
                summary="Imported from Zoom recording webhook.",
                transcript=None,
                participants=[],
                raw_payload={"source": "zoom_recording_webhook", "recording": recording},
                auto_create_contacts=True,
            ),
        )
        imported_artifacts = ZoomImportService._import_recording_files(
            db,
            token=token,
            meeting_id=response.meeting_id,
            recording=recording,
        )
        return {
            "imported_content_count": 0,
            "imported_meeting_count": 1,
            "imported_attendee_count": response.attendees_added,
            "imported_artifact_count": imported_artifacts,
            "recordings_found_count": 1,
            "errors": [],
        }

    @staticmethod
    def _credentials(db: Session, workspace_id=None) -> dict[str, str]:
        return {
            "account_id": ConnectionsService.stored_connector_value(db, "zoom", "account_id", workspace_id),
            "client_id": ConnectionsService.stored_connector_value(db, "zoom", "client_id", workspace_id),
            "client_secret": ConnectionsService.stored_connector_value(db, "zoom", "client_secret", workspace_id),
            "recording_user_id": ConnectionsService.stored_connector_value(db, "zoom", "recording_user_id", workspace_id),
            "access_token": ConnectionsService.stored_connector_value(db, "zoom", "access_token", workspace_id),
            "refresh_token": ConnectionsService.stored_connector_value(db, "zoom", "refresh_token", workspace_id),
            "expires_at": ConnectionsService.stored_connector_value(db, "zoom", "expires_at", workspace_id),
        }

    @staticmethod
    def _has_usable_credentials(credentials: dict[str, str]) -> bool:
        return bool(credentials.get("refresh_token") or credentials.get("access_token") or all(credentials.get(key) for key in ["account_id", "client_id", "client_secret"]))

    @staticmethod
    def _access_token(db: Session, credentials: dict[str, str], workspace_id=None) -> str:
        if credentials.get("access_token"):
            expires_at = ZoomImportService._parse_zoom_time(credentials.get("expires_at"))
            if not expires_at or expires_at > datetime.now(timezone.utc) + timedelta(minutes=2):
                return credentials["access_token"]
        if credentials.get("refresh_token"):
            refreshed = ConnectionsService.refresh_oauth_token(db, "zoom", workspace_id)
            if refreshed:
                return refreshed

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
        recordings: list[dict[str, Any]] = []
        next_page_token = ""
        while True:
            page = ZoomImportService._list_recordings_page(token, user_id, from_date, to_date, next_page_token)
            recordings.extend(page.get("meetings", []))
            next_page_token = str(page.get("next_page_token") or "")
            if not next_page_token:
                break
        return recordings

    @staticmethod
    def _list_recordings_windowed(token: str, user_id: str, oldest_date: date, to_date: date) -> list[dict[str, Any]]:
        recordings: list[dict[str, Any]] = []
        seen = set()
        window_end = to_date
        while window_end >= oldest_date:
            window_start = max(oldest_date, window_end - timedelta(days=29))
            for recording in ZoomImportService._list_recordings(token, user_id, window_start, window_end):
                key = str(recording.get("uuid") or recording.get("id") or recording.get("start_time") or len(seen))
                if key in seen:
                    continue
                seen.add(key)
                recordings.append(recording)
            window_end = window_start - timedelta(days=1)
        return recordings

    @staticmethod
    def _list_recordings_page(token: str, user_id: str, from_date: date, to_date: date, next_page_token: str = "") -> dict[str, Any]:
        params = {
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "page_size": 100,
        }
        if next_page_token:
            params["next_page_token"] = next_page_token

        response = httpx.get(
            f"{ZOOM_API_BASE}/users/{user_id}/recordings",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        if response.status_code >= 400 and user_id == "me":
            user_id = ZoomImportService._first_user_id(token)
            response = httpx.get(
                f"{ZOOM_API_BASE}/users/{user_id}/recordings",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
        if response.status_code >= 400:
            raise RuntimeError(ZoomImportService._error_text(response))
        return response.json()

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
    def _import_recording_files(
        db: Session,
        *,
        token: str,
        meeting_id,
        recording: dict[str, Any],
    ) -> int:
        imported = 0
        for recording_file in recording.get("recording_files") or []:
            if ZoomImportService._artifact_exists(db, meeting_id, recording_file):
                continue

            artifact_type = ZoomImportService._artifact_type(recording_file)
            file_name = ZoomImportService._file_name(recording, recording_file, artifact_type)
            download_url = recording_file.get("download_url") or recording_file.get("play_url")
            text_content = None
            status = "ready"
            notes = [f"Imported from Zoom {recording_file.get('file_type') or artifact_type} recording file."]

            if artifact_type in {"transcript", "caption", "chat", "summary", "text"} and download_url:
                try:
                    text_content = ZoomImportService._download_text(token, str(download_url))
                    text_content = RecordingArtifactService._clean_text_artifact(text_content)
                    notes.append(f"Downloaded {len(text_content)} text characters from Zoom.")
                    if not text_content:
                        status = "needs_review"
                        notes.append("Zoom text file downloaded but did not contain usable text.")
                except Exception as exc:
                    status = "needs_review"
                    notes.append(f"Could not download Zoom text file: {exc}")
            elif artifact_type in {"audio", "video"}:
                status = "pending_transcription"
                notes.append("Zoom media URL stored for transcription; no notetaker bot required.")

            RecordingArtifactService.create(
                db,
                meeting_id,
                RecordingArtifactCreate(
                    artifact_type=artifact_type,
                    file_name=file_name,
                    content_type=ZoomImportService._content_type(recording_file, artifact_type),
                    source_url=str(download_url) if download_url else None,
                    text_content=text_content,
                    file_size_bytes=int(recording_file.get("file_size") or 0),
                    status=status,
                    extraction_notes=notes,
                    raw_metadata={
                        "source": "zoom_recording_file",
                        "zoom_meeting_uuid": recording.get("uuid"),
                        "zoom_meeting_id": recording.get("id"),
                        "zoom_file_id": str(recording_file.get("id")) if recording_file.get("id") else None,
                        "zoom_file_type": recording_file.get("file_type"),
                        "zoom_recording_type": recording_file.get("recording_type"),
                    },
                ),
            )
            imported += 1

        return imported

    @staticmethod
    def _artifact_exists(db: Session, meeting_id, recording_file: dict[str, Any]) -> bool:
        file_id = recording_file.get("id")
        download_url = recording_file.get("download_url") or recording_file.get("play_url")
        query = db.query(RecordingArtifact).filter(RecordingArtifact.meeting_id == meeting_id)
        if file_id:
            return query.filter(RecordingArtifact.raw_metadata.contains({"zoom_file_id": str(file_id)})).first() is not None
        if download_url:
            return query.filter(RecordingArtifact.source_url == str(download_url)).first() is not None
        return False

    @staticmethod
    def _artifact_type(recording_file: dict[str, Any]) -> str:
        file_type = str(recording_file.get("file_type") or "").lower()
        recording_type = str(recording_file.get("recording_type") or "").lower()
        if "transcript" in recording_type or file_type in {"transcript", "vtt"}:
            return "transcript"
        if "caption" in recording_type or file_type in {"cc", "srt"}:
            return "caption"
        if "chat" in recording_type or file_type == "chat":
            return "chat"
        if "summary" in recording_type or file_type == "summary":
            return "summary"
        if file_type in {"m4a", "mp3"} or "audio" in recording_type:
            return "audio"
        if file_type in {"mp4", "mov", "webm"} or "video" in recording_type:
            return "video"
        if file_type in {"txt", "csv"}:
            return "text"
        return "unknown"

    @staticmethod
    def _file_name(recording: dict[str, Any], recording_file: dict[str, Any], artifact_type: str) -> str:
        extension = str(recording_file.get("file_extension") or recording_file.get("file_type") or artifact_type).lower()
        extension = extension.strip(".") or "txt"
        topic = "".join(ch for ch in str(recording.get("topic") or "zoom-recording") if ch.isalnum() or ch in {"-", "_", " "})
        started = ZoomImportService._parse_zoom_time(recording.get("start_time"))
        date_label = started.date().isoformat() if started else "unknown-date"
        return f"{topic.strip() or 'zoom-recording'}-{date_label}-{artifact_type}.{extension}"

    @staticmethod
    def _content_type(recording_file: dict[str, Any], artifact_type: str) -> str | None:
        file_type = str(recording_file.get("file_type") or "").lower()
        if artifact_type in {"transcript", "caption", "chat", "summary", "text"}:
            return "text/plain"
        if file_type == "m4a":
            return "audio/mp4"
        if file_type == "mp3":
            return "audio/mpeg"
        if file_type == "mp4":
            return "video/mp4"
        return None

    @staticmethod
    def _download_text(token: str, download_url: str) -> str:
        response = httpx.get(
            download_url,
            headers={"Authorization": f"Bearer {token}"},
            follow_redirects=True,
            timeout=60,
        )
        if response.status_code >= 400:
            raise RuntimeError(ZoomImportService._error_text(response))
        return response.text

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

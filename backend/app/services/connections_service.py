import os
import base64
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ConnectorCredential
from app.schemas.connections import ConnectorKey, ConnectorStatus, ConnectorUpdateRequest
from app.services.system_settings_service import get_setting, upsert_setting


CONNECTORS_SETTING_KEY = "connector_credentials"
AGENT_SYNC_SETTING_KEY = "agent_sync_jobs"


CONNECTOR_DEFINITIONS = {
    "skool": {
        "name": "Skool",
        "purpose": "Read classroom archives, community posts, session links, and replay pages as an authorized account.",
        "fields": [
            {
                "key": "session_cookie",
                "label": "Skool session cookie",
                "placeholder": "Authenticated Skool session value",
            },
            {
                "key": "community_url",
                "label": "Community URL",
                "secret": False,
                "placeholder": "https://www.skool.com/ourdealpartner",
            },
        ],
        "env": {"session_cookie": ["SKOOL_SESSION_COOKIE", "SKOOL_API_KEY"]},
    },
    "zoom": {
        "name": "Zoom",
        "purpose": "Each client connects their own Zoom account so RelateOS can pull recordings, transcripts, attendance, chat, and webinar metadata.",
        "fields": [
            {"key": "access_token", "label": "OAuth access token", "placeholder": "Connect with OAuth", "required": False},
            {"key": "refresh_token", "label": "OAuth refresh token", "placeholder": "Connect with OAuth", "required": False},
            {
                "key": "recording_user_id",
                "label": "Recording user ID or email",
                "secret": False,
                "required": False,
                "placeholder": "Optional Zoom user email; defaults to me",
            },
            {"key": "account_id", "label": "Legacy server-to-server account ID", "placeholder": "Zoom account ID", "required": False},
            {"key": "client_id", "label": "Legacy client ID", "placeholder": "Zoom client ID", "required": False},
            {"key": "client_secret", "label": "Legacy client secret", "placeholder": "Zoom client secret", "required": False},
        ],
        "env": {
            "account_id": ["ZOOM_ACCOUNT_ID"],
            "client_id": ["ZOOM_CLIENT_ID"],
            "client_secret": ["ZOOM_CLIENT_SECRET"],
            "recording_user_id": ["ZOOM_RECORDING_USER_ID"],
        },
    },
    "google_calendar": {
        "name": "Google Calendar",
        "purpose": "Each client connects their own calendar so events and meetings can become relationship signals.",
        "fields": [
            {"key": "access_token", "label": "OAuth access token", "placeholder": "Connect with OAuth", "required": False},
            {"key": "refresh_token", "label": "OAuth refresh token", "placeholder": "Connect with OAuth", "required": False},
            {"key": "calendar_id", "label": "Calendar ID", "secret": False, "required": False, "placeholder": "primary"},
        ],
        "env": {},
    },
    "read_ai": {
        "name": "Read.ai",
        "purpose": "Ingest AI meeting notes, transcripts, action items, and participants when a notetaker is used.",
        "fields": [
            {"key": "api_key", "label": "API key", "placeholder": "Read.ai API key"},
        ],
        "env": {"api_key": ["READ_AI_API_KEY", "READAI_API_KEY"]},
    },
    "openai": {
        "name": "AI generation",
        "purpose": "Generate summaries, action-item cleanup, relationship insights, and replay follow-up messages.",
        "fields": [
            {"key": "api_key", "label": "API key", "placeholder": "OpenAI API key"},
        ],
        "env": {"api_key": ["OPENAI_API_KEY"]},
    },
}


PIPELINE = [
    "Skool archive scan finds classroom sessions and replay links.",
    "Zoom or Read.ai pulls transcript, attendance, chat, and recording details.",
    "RelateOS stores content items, meetings, attendees, action items, and engagement events.",
    "Relationship graph and follow-up targets update automatically.",
]


class ConnectionsService:
    @staticmethod
    def overview(db: Session, workspace_id: uuid.UUID | None = None) -> dict:
        connectors = [ConnectionsService.connector_status(db, key, workspace_id) for key in CONNECTOR_DEFINITIONS]
        ready_count = len([connector for connector in connectors if connector["status"] == "ready"])
        recommended = "Connect Zoom and Google Calendar for this workspace so meetings become relationship signals."
        if ready_count >= 3:
            recommended = "Run a full sync, then keep the Thursday live-session watcher enabled."
        return {
            "connectors": connectors,
            "pipeline": PIPELINE,
            "recommended_next_step": recommended,
        }

    @staticmethod
    def connector_status(db: Session, key: ConnectorKey | str, workspace_id: uuid.UUID | None = None) -> dict:
        definition = CONNECTOR_DEFINITIONS[str(key)]
        stored = ConnectionsService._connector_values(db, str(key), workspace_id)
        fields = definition["fields"]
        configured_fields = []
        missing_fields = []
        allow_env_fallback = workspace_id is None

        for field in fields:
            field_key = field["key"]
            if field_key == "community_url":
                configured_fields.append(field_key)
                continue
            if ConnectionsService._field_configured(stored, definition.get("env", {}), field_key, allow_env_fallback):
                configured_fields.append(field_key)
            elif field.get("required", True):
                missing_fields.append(field_key)

        if str(key) in {"zoom", "google_calendar"} and "refresh_token" in configured_fields:
            missing_fields = []

        required_secret_fields = [field["key"] for field in fields if field.get("required", True) and field.get("secret", True)]
        configured_required = [field for field in required_secret_fields if field in configured_fields]
        if str(key) == "zoom" and (
            "refresh_token" in configured_fields
            or {"account_id", "client_id", "client_secret"}.issubset(set(configured_fields))
        ):
            status = "ready"
        elif str(key) == "google_calendar" and "refresh_token" in configured_fields:
            status = "ready"
        elif str(key) in {"zoom", "google_calendar"}:
            status = "needs_config"
        elif not required_secret_fields or len(configured_required) == len(required_secret_fields):
            status = "ready"
        elif configured_required:
            status = "partial"
        else:
            status = "needs_config"

        health = ConnectionsService._connector_health(str(key), stored, status)

        return {
            "key": str(key),
            "name": definition["name"],
            "status": status,
            "purpose": definition["purpose"],
            "fields": fields,
            "configured_fields": configured_fields,
            "missing_fields": missing_fields,
            "last_updated_at": stored.get("updated_at"),
            "health": health,
        }

    @staticmethod
    def update_connector(db: Session, key: ConnectorKey, payload: ConnectorUpdateRequest, workspace_id: uuid.UUID | None = None) -> dict:
        connector = ConnectionsService._connector_values(db, key, workspace_id)
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

        definition = CONNECTOR_DEFINITIONS[key]
        allowed_fields = {field["key"] for field in definition["fields"]}
        values = {
            field_key: value.strip()
            for field_key, value in payload.values.items()
            if field_key in allowed_fields and isinstance(value, str) and value.strip()
        }

        connector.update(values)
        connector["updated_at"] = now
        ConnectionsService._save_connector_values(db, key, connector, workspace_id)

        return {
            "connector": ConnectorStatus.model_validate(ConnectionsService.connector_status(db, key, workspace_id)),
            "message": f"{definition['name']} connector saved.",
        }

    @staticmethod
    def merge_connector_values(db: Session, connector_key: str, values: dict, workspace_id: uuid.UUID | None = None) -> None:
        connector = ConnectionsService._connector_values(db, connector_key, workspace_id)
        connector.update(values)
        connector["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        ConnectionsService._save_connector_values(db, connector_key, connector, workspace_id)

    @staticmethod
    def request_agent_sync(db: Session, mode: str, workspace_id: uuid.UUID | None = None) -> dict:
        connectors = [ConnectionsService.connector_status(db, key, workspace_id) for key in CONNECTOR_DEFINITIONS]
        blockers = []
        by_key = {connector["key"]: connector for connector in connectors}
        if by_key["skool"]["status"] != "ready":
            blockers.append("Skool auth is required to scan classroom pages without Zapier.")
        if by_key["zoom"]["status"] != "ready" and by_key["read_ai"]["status"] != "ready":
            blockers.append("This workspace needs Zoom or Read.ai connected to capture recordings, attendance, transcript, and chat.")
        if by_key["openai"]["status"] != "ready":
            blockers.append("AI generation is required for summaries, action-item cleanup, and follow-up drafts.")

        now = datetime.now(timezone.utc).replace(microsecond=0)
        imported = {
            "imported_content_count": 0,
            "imported_meeting_count": 0,
            "imported_attendee_count": 0,
            "imported_artifact_count": 0,
            "recordings_found_count": 0,
            "ai_notes_found_count": 0,
            "errors": [],
        }
        if not blockers and mode in {"archive", "full"}:
            from app.services.skool_import_service import SkoolImportService
            from app.services.zoom_import_service import ZoomImportService

            skool_import = SkoolImportService.import_classroom_archive(db)
            zoom_import = ZoomImportService.import_recent_recordings(db, workspace_id=workspace_id)
            imported = {
                "imported_content_count": skool_import["imported_content_count"] + zoom_import["imported_content_count"],
                "imported_meeting_count": skool_import["imported_meeting_count"] + zoom_import["imported_meeting_count"],
                "imported_attendee_count": skool_import["imported_attendee_count"] + zoom_import["imported_attendee_count"],
                "imported_artifact_count": zoom_import.get("imported_artifact_count", 0),
                "errors": [*skool_import["errors"], *zoom_import["errors"]],
            }
        job = {
            "job_id": str(uuid.uuid4()),
            "mode": mode,
            "status": ConnectionsService._sync_status(blockers, imported["errors"]),
            "requested_at": now.isoformat(),
            "blockers": blockers,
            "errors": imported["errors"],
        }
        jobs = get_setting(db, AGENT_SYNC_SETTING_KEY, {"jobs": []})
        jobs["jobs"] = [job, *jobs.get("jobs", [])[:24]]
        upsert_setting(db, AGENT_SYNC_SETTING_KEY, jobs)

        return {
            **job,
            "message": (
                "Agent sync completed. RelateOS imported available Zoom recordings and meeting intelligence."
                if not blockers and not imported["errors"]
                else "Agent sync partially completed. Review connector scopes or missing recording access."
                if not blockers
                else "Agent sync is designed, but connector configuration is still missing."
            ),
            "pipeline": PIPELINE,
            **imported,
        }

    @staticmethod
    def stored_connector_value(db: Session, connector_key: str, field_key: str, workspace_id: uuid.UUID | None = None) -> str:
        stored = ConnectionsService._connector_values(db, connector_key, workspace_id)
        value = stored.get(field_key)
        if isinstance(value, str) and value:
            return value
        env_keys = CONNECTOR_DEFINITIONS.get(connector_key, {}).get("env", {}).get(field_key, [])
        for env_key in env_keys:
            env_value = os.getenv(env_key)
            if env_value:
                return env_value
        return ""

    @staticmethod
    def connector_ready(db: Session, connector_key: str, workspace_id: uuid.UUID | None = None) -> bool:
        return ConnectionsService.connector_status(db, connector_key, workspace_id)["status"] == "ready"

    @staticmethod
    def oauth_start_url(connector_key: str, workspace_id: uuid.UUID) -> str:
        state = ConnectionsService._encode_oauth_state(connector_key, workspace_id)
        if connector_key == "zoom":
            if not settings.zoom_oauth_client_id or not settings.zoom_oauth_client_secret or not settings.zoom_oauth_redirect_uri:
                raise ValueError("Zoom OAuth app credentials are not configured.")
            redirect_uri = settings.zoom_oauth_redirect_uri
            return "https://zoom.us/oauth/authorize?" + urlencode(
                {
                    "response_type": "code",
                    "client_id": settings.zoom_oauth_client_id,
                    "redirect_uri": redirect_uri,
                    "state": state,
                }
            )
        if connector_key == "google_calendar":
            if not settings.google_calendar_client_id or not settings.google_calendar_client_secret or not settings.google_calendar_redirect_uri:
                raise ValueError("Google Calendar OAuth app credentials are not configured.")
            redirect_uri = settings.google_calendar_redirect_uri
            return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
                {
                    "response_type": "code",
                    "client_id": settings.google_calendar_client_id,
                    "redirect_uri": redirect_uri,
                    "scope": "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
                    "access_type": "offline",
                    "prompt": "consent",
                    "state": state,
                }
            )
        raise ValueError("Unsupported OAuth connector")

    @staticmethod
    def oauth_callback(db: Session, connector_key: str, code: str, state: str) -> dict:
        state_payload = ConnectionsService._decode_oauth_state(state)
        workspace_id = uuid.UUID(state_payload["workspace_id"])
        if state_payload["connector_key"] != connector_key:
            raise ValueError("OAuth connector state mismatch")

        if connector_key == "zoom":
            values = ConnectionsService._exchange_zoom_code(code)
        elif connector_key == "google_calendar":
            values = ConnectionsService._exchange_google_code(code)
        else:
            raise ValueError("Unsupported OAuth connector")

        existing = ConnectionsService._connector_values(db, connector_key, workspace_id)
        existing.update(values)
        existing["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        ConnectionsService._save_connector_values(db, connector_key, existing, workspace_id)
        return ConnectorStatus.model_validate(ConnectionsService.connector_status(db, connector_key, workspace_id)).model_dump()

    @staticmethod
    def refresh_oauth_token(db: Session, connector_key: str, workspace_id: uuid.UUID | None = None) -> str:
        values = ConnectionsService._connector_values(db, connector_key, workspace_id)
        refresh_token = values.get("refresh_token")
        if not refresh_token:
            return ""

        if connector_key == "zoom":
            refreshed = ConnectionsService._refresh_zoom_token(refresh_token)
        elif connector_key == "google_calendar":
            refreshed = ConnectionsService._refresh_google_token(refresh_token)
        else:
            return ""
        values.update(refreshed)
        values["refresh_token"] = refreshed.get("refresh_token") or refresh_token
        values["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        ConnectionsService._save_connector_values(db, connector_key, values, workspace_id)
        return str(values.get("access_token") or "")

    @staticmethod
    def workspace_for_connector_value(db: Session, connector_key: str, field_key: str, value: str | None) -> uuid.UUID | None:
        if not value:
            return None
        rows = db.query(ConnectorCredential).filter(ConnectorCredential.connector_key == connector_key).all()
        for row in rows:
            if str((row.values or {}).get(field_key) or "") == str(value):
                return row.workspace_id
        return None

    @staticmethod
    def _connector_values(db: Session, connector_key: str, workspace_id: uuid.UUID | None = None) -> dict:
        if workspace_id:
            row = (
                db.query(ConnectorCredential)
                .filter(ConnectorCredential.workspace_id == workspace_id, ConnectorCredential.connector_key == connector_key)
                .first()
            )
            return dict(row.values or {}) if row else {}
        return get_setting(db, CONNECTORS_SETTING_KEY, {}).get(connector_key, {})

    @staticmethod
    def _save_connector_values(db: Session, connector_key: str, values: dict, workspace_id: uuid.UUID | None = None) -> None:
        if workspace_id:
            row = (
                db.query(ConnectorCredential)
                .filter(ConnectorCredential.workspace_id == workspace_id, ConnectorCredential.connector_key == connector_key)
                .first()
            )
            if not row:
                row = ConnectorCredential(id=uuid.uuid4(), workspace_id=workspace_id, connector_key=connector_key, values={})
                db.add(row)
            row.values = values
            db.commit()
            return

        existing = get_setting(db, CONNECTORS_SETTING_KEY, {})
        existing[connector_key] = values
        upsert_setting(db, CONNECTORS_SETTING_KEY, existing)

    @staticmethod
    def _encode_oauth_state(connector_key: str, workspace_id: uuid.UUID) -> str:
        payload = {
            "connector_key": connector_key,
            "workspace_id": str(workspace_id),
            "nonce": secrets.token_urlsafe(12),
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=15)).timestamp()),
        }
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        body = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
        sig = hmac.new(settings.auth_secret_key.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
        return f"{body}.{sig}"

    @staticmethod
    def _decode_oauth_state(state: str) -> dict:
        try:
            body, sig = state.split(".", 1)
            expected = hmac.new(settings.auth_secret_key.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected):
                raise ValueError("OAuth state signature mismatch")
            padded = body + "=" * (-len(body) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
            if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
                raise ValueError("OAuth state expired")
            return payload
        except Exception as exc:
            raise ValueError("Invalid OAuth state") from exc

    @staticmethod
    def _expires_at(expires_in: int | str | None) -> str:
        seconds = int(expires_in or 3600)
        return (datetime.now(timezone.utc) + timedelta(seconds=max(seconds - 60, 60))).replace(microsecond=0).isoformat()

    @staticmethod
    def _exchange_zoom_code(code: str) -> dict:
        auth = base64.b64encode(f"{settings.zoom_oauth_client_id}:{settings.zoom_oauth_client_secret}".encode()).decode()
        response = httpx.post(
            "https://zoom.us/oauth/token",
            params={"grant_type": "authorization_code", "code": code, "redirect_uri": settings.zoom_oauth_redirect_uri},
            headers={"Authorization": f"Basic {auth}"},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        return {
            "access_token": payload.get("access_token"),
            "refresh_token": payload.get("refresh_token"),
            "expires_at": ConnectionsService._expires_at(payload.get("expires_in")),
            "account_id": payload.get("account_id"),
            "token_type": payload.get("token_type"),
            "oauth_connected_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        }

    @staticmethod
    def _refresh_zoom_token(refresh_token: str) -> dict:
        auth = base64.b64encode(f"{settings.zoom_oauth_client_id}:{settings.zoom_oauth_client_secret}".encode()).decode()
        response = httpx.post(
            "https://zoom.us/oauth/token",
            params={"grant_type": "refresh_token", "refresh_token": refresh_token},
            headers={"Authorization": f"Basic {auth}"},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        return {
            "access_token": payload.get("access_token"),
            "refresh_token": payload.get("refresh_token") or refresh_token,
            "expires_at": ConnectionsService._expires_at(payload.get("expires_in")),
            "token_type": payload.get("token_type"),
        }

    @staticmethod
    def _exchange_google_code(code: str) -> dict:
        response = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_calendar_client_id,
                "client_secret": settings.google_calendar_client_secret,
                "redirect_uri": settings.google_calendar_redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        return {
            "access_token": payload.get("access_token"),
            "refresh_token": payload.get("refresh_token"),
            "expires_at": ConnectionsService._expires_at(payload.get("expires_in")),
            "scope": payload.get("scope"),
            "token_type": payload.get("token_type"),
            "calendar_id": "primary",
            "oauth_connected_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        }

    @staticmethod
    def _refresh_google_token(refresh_token: str) -> dict:
        response = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "refresh_token": refresh_token,
                "client_id": settings.google_calendar_client_id,
                "client_secret": settings.google_calendar_client_secret,
                "grant_type": "refresh_token",
            },
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        return {
            "access_token": payload.get("access_token"),
            "expires_at": ConnectionsService._expires_at(payload.get("expires_in")),
            "scope": payload.get("scope"),
            "token_type": payload.get("token_type"),
        }

    @staticmethod
    def _field_configured(stored: dict, env_map: dict, field_key: str, allow_env_fallback: bool = True) -> bool:
        if stored.get(field_key):
            return True
        if not allow_env_fallback:
            return False
        return any(os.getenv(env_key) for env_key in env_map.get(field_key, []))

    @staticmethod
    def _connector_health(connector_key: str, stored: dict, status: str) -> dict:
        health = {
            "level": "green" if status == "ready" else "yellow" if status == "partial" else "red",
            "last_sync_at": stored.get("last_sync_at"),
            "last_sync_status": stored.get("last_sync_status"),
            "last_error": stored.get("last_error"),
            "records_imported": stored.get("records_imported"),
        }
        if connector_key == "google_calendar":
            scope = str(stored.get("scope") or "")
            if status == "ready" and "contacts.readonly" not in scope:
                health["level"] = "yellow"
                health["last_error"] = "Reconnect Google to approve Contacts access before syncing contacts."
            elif status == "ready" and "gmail.send" not in scope:
                health["level"] = "yellow"
                health["last_error"] = "Reconnect Google to approve Gmail send access before emailing event invites."
            elif status != "ready":
                health["last_error"] = "Connect Google to create calendar events and import contacts."
        if connector_key == "zoom" and status != "ready":
            health["last_error"] = "Connect Zoom to import recordings, transcripts, AI notes, and attendance."
        if connector_key == "openai" and status != "ready":
            health["last_error"] = "Add an OpenAI API key to enable AI summaries and follow-up drafts."
        return {key: value for key, value in health.items() if value not in (None, "")}

    @staticmethod
    def _sync_status(blockers: list[str], errors: list[str]) -> str:
        if blockers:
            return "needs_config"
        if errors:
            return "partial"
        return "completed"

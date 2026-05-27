import os
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

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
        "purpose": "Pull Thursday recordings, transcripts, attendance reports, chat, and webinar metadata directly.",
        "fields": [
            {"key": "account_id", "label": "Server-to-server account ID", "placeholder": "Zoom account ID"},
            {"key": "client_id", "label": "Client ID", "placeholder": "Zoom client ID"},
            {"key": "client_secret", "label": "Client secret", "placeholder": "Zoom client secret"},
            {
                "key": "recording_user_id",
                "label": "Recording user ID or email",
                "secret": False,
                "required": False,
                "placeholder": "Optional Zoom user email; defaults to me",
            },
        ],
        "env": {
            "account_id": ["ZOOM_ACCOUNT_ID"],
            "client_id": ["ZOOM_CLIENT_ID"],
            "client_secret": ["ZOOM_CLIENT_SECRET"],
            "recording_user_id": ["ZOOM_RECORDING_USER_ID"],
        },
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
    def overview(db: Session) -> dict:
        connectors = [ConnectionsService.connector_status(db, key) for key in CONNECTOR_DEFINITIONS]
        ready_count = len([connector for connector in connectors if connector["status"] == "ready"])
        recommended = "Configure Skool and Zoom first so archive discovery and Thursday recording imports can run."
        if ready_count >= 3:
            recommended = "Run a full sync, then keep the Thursday live-session watcher enabled."
        return {
            "connectors": connectors,
            "pipeline": PIPELINE,
            "recommended_next_step": recommended,
        }

    @staticmethod
    def connector_status(db: Session, key: ConnectorKey | str) -> dict:
        definition = CONNECTOR_DEFINITIONS[str(key)]
        stored = get_setting(db, CONNECTORS_SETTING_KEY, {}).get(str(key), {})
        fields = definition["fields"]
        configured_fields = []
        missing_fields = []

        for field in fields:
            field_key = field["key"]
            if field_key == "community_url":
                configured_fields.append(field_key)
                continue
            if ConnectionsService._field_configured(stored, definition.get("env", {}), field_key):
                configured_fields.append(field_key)
            elif field.get("required", True):
                missing_fields.append(field_key)

        required_secret_fields = [field["key"] for field in fields if field.get("required", True) and field.get("secret", True)]
        configured_required = [field for field in required_secret_fields if field in configured_fields]
        if not required_secret_fields or len(configured_required) == len(required_secret_fields):
            status = "ready"
        elif configured_required:
            status = "partial"
        else:
            status = "needs_config"

        return {
            "key": str(key),
            "name": definition["name"],
            "status": status,
            "purpose": definition["purpose"],
            "fields": fields,
            "configured_fields": configured_fields,
            "missing_fields": missing_fields,
            "last_updated_at": stored.get("updated_at"),
        }

    @staticmethod
    def update_connector(db: Session, key: ConnectorKey, payload: ConnectorUpdateRequest) -> dict:
        existing = get_setting(db, CONNECTORS_SETTING_KEY, {})
        connector = existing.get(key, {})
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
        existing[key] = connector
        upsert_setting(db, CONNECTORS_SETTING_KEY, existing)

        return {
            "connector": ConnectorStatus.model_validate(ConnectionsService.connector_status(db, key)),
            "message": f"{definition['name']} connector saved.",
        }

    @staticmethod
    def request_agent_sync(db: Session, mode: str) -> dict:
        connectors = [ConnectionsService.connector_status(db, key) for key in CONNECTOR_DEFINITIONS]
        blockers = []
        by_key = {connector["key"]: connector for connector in connectors}
        if by_key["skool"]["status"] != "ready":
            blockers.append("Skool auth is required to scan classroom pages without Zapier.")
        if by_key["zoom"]["status"] != "ready" and by_key["read_ai"]["status"] != "ready":
            blockers.append("Zoom or Read.ai is required to capture recordings, attendance, transcript, and chat.")
        if by_key["openai"]["status"] != "ready":
            blockers.append("AI generation is required for summaries, action-item cleanup, and follow-up drafts.")

        now = datetime.now(timezone.utc).replace(microsecond=0)
        imported = {
            "imported_content_count": 0,
            "imported_meeting_count": 0,
            "imported_attendee_count": 0,
            "errors": [],
        }
        if not blockers and mode in {"archive", "full"}:
            from app.services.skool_import_service import SkoolImportService
            from app.services.zoom_import_service import ZoomImportService

            skool_import = SkoolImportService.import_classroom_archive(db)
            zoom_import = ZoomImportService.import_recent_recordings(db)
            imported = {
                "imported_content_count": skool_import["imported_content_count"] + zoom_import["imported_content_count"],
                "imported_meeting_count": skool_import["imported_meeting_count"] + zoom_import["imported_meeting_count"],
                "imported_attendee_count": skool_import["imported_attendee_count"] + zoom_import["imported_attendee_count"],
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
    def stored_connector_value(db: Session, connector_key: str, field_key: str) -> str:
        stored = get_setting(db, CONNECTORS_SETTING_KEY, {}).get(connector_key, {})
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
    def connector_ready(db: Session, connector_key: str) -> bool:
        return ConnectionsService.connector_status(db, connector_key)["status"] == "ready"

    @staticmethod
    def _field_configured(stored: dict, env_map: dict, field_key: str) -> bool:
        if stored.get(field_key):
            return True
        return any(os.getenv(env_key) for env_key in env_map.get(field_key, []))

    @staticmethod
    def _sync_status(blockers: list[str], errors: list[str]) -> str:
        if blockers:
            return "needs_config"
        if errors:
            return "partial"
        return "completed"

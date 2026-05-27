import os
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import ContentItem
from app.schemas.content import ContentCreate, SkoolAgentSyncRequest
from app.services.content_service import ContentService
from app.services.system_settings_service import get_setting, upsert_setting


SKOOL_AGENT_SETTING_KEY = "skool_agent"
DEFAULT_COMMUNITY_URL = "https://www.skool.com/ourdealpartner"
DEFAULT_CLASSROOM_URL = "https://www.skool.com/ourdealpartner/classroom"


class SkoolAgentService:
    @staticmethod
    def status(db: Session) -> dict:
        setting = get_setting(db, SKOOL_AGENT_SETTING_KEY, {})
        community_url = setting.get("community_url") or DEFAULT_COMMUNITY_URL
        classroom_url = setting.get("classroom_url") or DEFAULT_CLASSROOM_URL
        last_sync = setting.get("last_sync") or {}
        capabilities = SkoolAgentService._capabilities()
        ready = all(item["status"] == "ready" for item in capabilities[:3])

        return {
            "community_url": community_url,
            "classroom_url": classroom_url,
            "schedule_label": "Every Thursday class session through Skool / Zoom",
            "timezone": "America/Chicago",
            "status": "ready" if ready else "needs_connector",
            "last_sync_mode": last_sync.get("mode"),
            "last_sync_at": last_sync.get("requested_at"),
            "next_session_label": "Next Thursday live session",
            "capabilities": capabilities,
            "next_steps": SkoolAgentService._next_steps(capabilities),
        }

    @staticmethod
    def request_sync(db: Session, payload: SkoolAgentSyncRequest) -> dict:
        now = datetime.now(timezone.utc).replace(microsecond=0)
        hub_created = 0
        if payload.auto_create_content:
            hub_created = SkoolAgentService._ensure_skool_hub(db, payload.community_url)

        setting = get_setting(db, SKOOL_AGENT_SETTING_KEY, {})
        last_sync = {
            "job_id": str(uuid.uuid4()),
            "mode": payload.mode,
            "requested_at": now.isoformat(),
            "auto_create_content": payload.auto_create_content,
            "auto_create_meetings": payload.auto_create_meetings,
            "auto_generate_followups": payload.auto_generate_followups,
        }
        setting.update(
            {
                "community_url": payload.community_url,
                "classroom_url": payload.classroom_url,
                "last_sync": last_sync,
            }
        )
        upsert_setting(db, SKOOL_AGENT_SETTING_KEY, setting)

        status = SkoolAgentService.status(db)
        is_ready = status["status"] == "ready"
        return {
            **status,
            "status": "queued" if is_ready else "needs_connector",
            "job_id": last_sync["job_id"],
            "requested_mode": payload.mode,
            "created_content_count": hub_created,
            "created_meeting_count": 0,
            "discovered_session_count": 0,
            "message": (
                "Skool agent sync queued. The worker will scan the classroom archive, import recordings, "
                "create meeting intelligence, and prepare follow-ups."
                if is_ready
                else "Skool agent configured. Add Skool auth plus Zoom or Read.ai access before archive discovery and live attendance can run automatically."
            ),
        }

    @staticmethod
    def _ensure_skool_hub(db: Session, community_url: str) -> int:
        existing = (
            db.query(ContentItem)
            .filter(ContentItem.source_type == "skool", ContentItem.source_url == community_url)
            .first()
        )
        if existing:
            return 0

        ContentService.create_content_item(
            db,
            ContentCreate(
                title="Our Deal Partner Skool",
                description=(
                    "Agent-managed Skool source for classroom recordings, community posts, "
                    "live session intelligence, and member follow-up workflows."
                ),
                source_type="skool",
                source_url=community_url,
            ),
        )
        return 1

    @staticmethod
    def _capabilities() -> list[dict]:
        skool_auth_ready = bool(os.getenv("SKOOL_SESSION_COOKIE") or os.getenv("SKOOL_API_KEY"))
        zoom_ready = bool(os.getenv("ZOOM_ACCOUNT_ID") and os.getenv("ZOOM_CLIENT_ID") and os.getenv("ZOOM_CLIENT_SECRET"))
        read_ai_ready = bool(os.getenv("READ_AI_API_KEY") or os.getenv("READAI_API_KEY"))
        openai_ready = bool(os.getenv("OPENAI_API_KEY"))

        return [
            {
                "key": "skool_archive",
                "label": "Skool classroom archive scan",
                "status": "ready" if skool_auth_ready else "needs_connector",
                "detail": "Find past Thursday sessions, classroom links, replay URLs, and Skool post context.",
            },
            {
                "key": "recording_capture",
                "label": "Zoom recording and transcript capture",
                "status": "ready" if zoom_ready or read_ai_ready else "needs_connector",
                "detail": "Pull recording links, attendance, chat, transcripts, and replay metadata without manual entry.",
            },
            {
                "key": "meeting_intelligence",
                "label": "Meeting intelligence storage",
                "status": "ready",
                "detail": "Store summaries, attendees, action items, engagement events, and relationship graph evidence.",
            },
            {
                "key": "followups",
                "label": "Engagement follow-ups",
                "status": "ready" if openai_ready else "needs_connector",
                "detail": "Generate replay shares, action-item reminders, and audience-specific follow-up copy.",
            },
            {
                "key": "live_agent",
                "label": "Live session attendance",
                "status": "planned" if zoom_ready or read_ai_ready else "needs_connector",
                "detail": "Join or ingest each Thursday class session, track attendance and participation, then file the recap.",
            },
        ]

    @staticmethod
    def _next_steps(capabilities: list[dict]) -> list[str]:
        steps = []
        if any(item["key"] == "skool_archive" and item["status"] != "ready" for item in capabilities):
            steps.append("Connect Skool auth so the agent can read the classroom archive and member-only replay pages.")
        if any(item["key"] == "recording_capture" and item["status"] != "ready" for item in capabilities):
            steps.append("Connect Zoom recording access or Read.ai so attendance, chat, transcript, and replay metadata are captured automatically.")
        if any(item["key"] == "followups" and item["status"] != "ready" for item in capabilities):
            steps.append("Add AI generation credentials so replay and engagement follow-ups can be drafted after each session.")
        if not steps:
            steps.append("Run a full sync to import the archive, then enable the weekly live-session watcher.")
        return steps

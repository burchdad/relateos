import html
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote

import httpx
from sqlalchemy.orm import Session

from app.models import ContentItem
from app.schemas.content import ContentCreate
from app.schemas.meeting import MeetingIntelligenceReportRequest
from app.services.connections_service import ConnectionsService
from app.services.content_service import ContentService
from app.services.meeting_service import MeetingService


DEFAULT_SKOOL_COMMUNITY_URL = "https://www.skool.com/ourdealpartner"
DEFAULT_CLASSROOM_URL = f"{DEFAULT_SKOOL_COMMUNITY_URL}/classroom"

KNOWN_THURSDAY_SESSIONS = [
    ("Thursday May 21, 2026", "https://us02web.zoom.us/rec/share/H4lb18mTE5JnIsEudFN_303850KPiMzuv-GyXY7H0hITp_0PdG1w6RUmQSXSOlKF.SeINL4b-ndOJSwTA?startTime=1779386466000"),
    ("Thursday May 14, 2026", "https://us02web.zoom.us/rec/share/odiuZNrCjIbhAvsxPSRH1_WFIACW4N5N1avdEzZod_D3p6isBnyjS0qxU7rsXIua.M1BmlBTN15-yHdi3?startTime=1778781579000"),
    ("Thursday May 7, 2026", "https://us02web.zoom.us/rec/share/tR4ezcCx59HYLfevaoKMiCdGE25ErVaURR_oXZ660JhAVh45OAHytRQUTHvDJjVH.QjO7vtqi-Tcvxa07?startTime=1778176807000"),
    ("Thursday April 30, 2026", "https://us02web.zoom.us/rec/share/SONLJYAEMQbUNqfKS2wvd9nHcovrGk2oqyoOOpPXQTgMAVN8MTx-7H08yrsHd-4.q7YjevuQpO9llAcp?startTime=1777572010000"),
    ("Thursday April 23, 2026", "https://us02web.zoom.us/rec/share/BX3P_z490J5MLQnUoYYKVGEQQq8AnvlNaHubkAIi-SwrCjgM5DRaADZ4YxiIg8Oz.ftHIDDzNPWx3LXe0?startTime=1776967371000"),
    ("Thursday April 16, 2026", "https://us02web.zoom.us/rec/share/RFll8up6YNRgBNqh8LMBs_dvpc7-qkaGxwYduH6RVBmrvg7NyQyrQqKdzea0OZmw.VcxCV9hMfOjw-T2h?startTime=1776361687000"),
    ("Thursday April 9, 2026", "https://us02web.zoom.us/rec/share/BIxptpPNTBg6Ks4mnFY9i0RDjwhjo4xZvhCIBcwW3-lF-RXFv4f7hKbO0gRhQnvJ._nANwMDEx_ieGuoH?startTime=1775757113000"),
    ("Thursday April 2, 2026", "https://us02web.zoom.us/rec/share/iW_-I4eO8keLPO9A7toski99_z14JBSDGypivIc8sf1GX_cuwbuVHLxM4xBYf6Eb.wyTntDNxx-lap7Hd?startTime=1775152159000"),
    ("Thursday March 26, 2026", "https://us02web.zoom.us/rec/share/bwTFt5j423kJtL17M0QM-QxKlmXeiU5GL7qBMhIKTYwIcgyJEqcqsyo5JqEy1nEQ.6ateDhWsBHz24QAa?startTime=1774547032000"),
    ("Thursday March 19, 2026", "https://us02web.zoom.us/rec/share/p7mzUqQPQHUCPvI4KNJlWGOwhH4omUJEjTcJevVk88M11c0gebQNke284Oe49Y7R.Y68tuIqoeRQEm2Zt?startTime=1773942455000"),
]


class SkoolImportService:
    @staticmethod
    def import_classroom_archive(db: Session) -> dict:
        community_url = ConnectionsService.stored_connector_value(db, "skool", "community_url") or DEFAULT_SKOOL_COMMUNITY_URL
        classroom_url = f"{community_url.rstrip('/')}/classroom"
        session_cookie = ConnectionsService.stored_connector_value(db, "skool", "session_cookie")
        discovered_sessions: list[dict[str, Any]] = []
        errors: list[str] = []

        if session_cookie:
            try:
                html_text = SkoolImportService._fetch_classroom(classroom_url, session_cookie)
                discovered_sessions = SkoolImportService._extract_sessions(html_text)
            except Exception as exc:
                errors.append(f"Skool classroom scan unavailable: {exc}")

        sessions = SkoolImportService._merge_sessions(
            discovered_sessions,
            [
                {
                    "title": title,
                    "recording_url": url,
                    "classroom_url": classroom_url,
                    "session_date": SkoolImportService._date_from_title(title),
                    "source": "client_archive_seed",
                }
                for title, url in KNOWN_THURSDAY_SESSIONS
            ],
        )

        imported_content = 0
        imported_meetings = 0
        for session in sessions:
            created_content = SkoolImportService._ensure_content(db, session)
            imported_content += created_content
            response = MeetingService.ingest_intelligence_report(
                db,
                MeetingIntelligenceReportRequest(
                    provider="skool",
                    external_meeting_id=session["recording_url"],
                    title=f"Skool {session['title']}",
                    platform="zoom",
                    meeting_url=session["recording_url"],
                    started_at=session.get("session_date"),
                    summary="Skool classroom replay imported for content sharing and follow-up workflows.",
                    raw_payload={
                        "source": session.get("source", "skool_archive"),
                        "skool_classroom_url": session.get("classroom_url") or classroom_url,
                        "zoom_recording_url": session["recording_url"],
                    },
                ),
            )
            if response.meeting_id:
                imported_meetings += 1

        return {
            "imported_content_count": imported_content,
            "imported_meeting_count": imported_meetings,
            "imported_attendee_count": 0,
            "errors": errors,
            "discovered_session_count": len(sessions),
        }

    @staticmethod
    def _fetch_classroom(classroom_url: str, session_cookie: str) -> str:
        cookie = session_cookie if "=" in session_cookie else f"auth_token={session_cookie}"
        response = httpx.get(
            classroom_url,
            headers={
                "Cookie": cookie,
                "User-Agent": "RelateOS Skool archive importer/1.0",
                "Accept": "text/html,application/xhtml+xml",
            },
            follow_redirects=True,
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"{response.status_code} while fetching classroom")
        return response.text

    @staticmethod
    def _extract_sessions(html_text: str) -> list[dict[str, Any]]:
        decoded = html.unescape(unquote(html_text))
        zoom_links = list(dict.fromkeys(re.findall(r"https://us\d+web\.zoom\.us/rec/share/[^\s\"'<>\\]+", decoded)))
        date_labels = re.findall(
            r"Thursday\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+2026",
            decoded,
            flags=re.IGNORECASE,
        )
        sessions = []
        for idx, url in enumerate(zoom_links):
            title = date_labels[idx] if idx < len(date_labels) else f"Thursday Community Recording {idx + 1}"
            sessions.append(
                {
                    "title": SkoolImportService._normalize_title(title),
                    "recording_url": url,
                    "classroom_url": DEFAULT_CLASSROOM_URL,
                    "session_date": SkoolImportService._date_from_title(title),
                    "source": "skool_archive_scan",
                }
            )
        return sessions

    @staticmethod
    def _merge_sessions(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for group in groups:
            for session in group:
                url = session.get("recording_url")
                if url and url not in merged:
                    merged[url] = session
        return list(merged.values())

    @staticmethod
    def _ensure_content(db: Session, session: dict[str, Any]) -> int:
        existing = db.query(ContentItem).filter(ContentItem.source_url == session["recording_url"]).first()
        if existing:
            return 0
        ContentService.create_content_item(
            db,
            ContentCreate(
                title=f"Skool {session['title']}",
                description=(
                    "Skool Thursday community recording imported from the classroom archive.\n\n"
                    f"Skool classroom: {session.get('classroom_url') or DEFAULT_CLASSROOM_URL}\n"
                    f"Zoom replay: {session['recording_url']}"
                ),
                source_type="skool",
                source_url=session["recording_url"],
            ),
        )
        return 1

    @staticmethod
    def _normalize_title(value: str) -> str:
        return re.sub(r"\s+", " ", value.replace(",", "")).strip()

    @staticmethod
    def _date_from_title(value: str) -> datetime | None:
        cleaned = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", value.replace(",", ""), flags=re.IGNORECASE)
        try:
            parsed = datetime.strptime(cleaned.strip(), "Thursday %B %d %Y")
            return parsed.replace(hour=18, tzinfo=timezone.utc)
        except Exception:
            return None

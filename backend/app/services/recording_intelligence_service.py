import json
import re
import uuid
from html import unescape

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Meeting
from app.schemas.meeting import (
    MeetingActionItemIn,
    MeetingIntelligenceReportRequest,
    MeetingRecordingAnalysisResponse,
    MeetingReportParticipant,
)
from app.services.connections_service import ConnectionsService
from app.services.meeting_service import MeetingService


EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
TAG_PATTERN = re.compile(r"<[^>]+>")


class RecordingIntelligenceService:
    @staticmethod
    def analyze(db: Session, meeting_id: uuid.UUID) -> MeetingRecordingAnalysisResponse:
        meeting = MeetingService.get_by_id(db, meeting_id)
        if not meeting:
            raise ValueError("Meeting not found")

        source_notes: list[str] = []
        transcript = (meeting.transcript or "").strip()
        page_text = ""
        if transcript:
            source_notes.append("Used existing transcript saved on the meeting.")

        if not transcript and meeting.meeting_url:
            try:
                page_text = RecordingIntelligenceService._fetch_replay_page_text(meeting.meeting_url)
                if page_text:
                    source_notes.append("Scanned replay page text for visible transcript, speaker, and email signals.")
            except Exception as exc:
                source_notes.append(f"Replay page scan failed: {exc}")

        text_for_ai = transcript or page_text
        if not text_for_ai:
            RecordingIntelligenceService._mark_analysis_attempt(meeting, source_notes)
            db.commit()
            return MeetingRecordingAnalysisResponse(
                meeting_id=meeting.id,
                status="needs_transcript",
                message=(
                    "The replay link was saved, but Zoom did not expose transcript/audio text to the backend. "
                    "Connect a Zoom-owned recording transcript, Read.ai, or a downloadable audio/transcript source for full AI notes."
                ),
                transcript_available=False,
                source_notes=source_notes,
            )

        ai_payload = RecordingIntelligenceService._ai_extract(db, meeting, text_for_ai)
        participants = [
            MeetingReportParticipant(
                name=item.get("name"),
                email=item.get("email"),
                role=item.get("role"),
            )
            for item in ai_payload.get("participants", [])
            if item.get("name") or item.get("email")
        ]
        if not participants:
            participants = [
                MeetingReportParticipant(email=email)
                for email in sorted(set(EMAIL_PATTERN.findall(text_for_ai)))[:50]
            ]

        action_items = [
            MeetingActionItemIn(text=item if isinstance(item, str) else item.get("text", ""))
            for item in ai_payload.get("action_items", [])
            if (item if isinstance(item, str) else item.get("text"))
        ]
        summary = ai_payload.get("summary") or meeting.summary or "Recording analyzed by RelateOS."

        response = MeetingService.ingest_intelligence_report(
            db,
            MeetingIntelligenceReportRequest(
                provider=meeting.source_provider or "recording_ai",
                external_meeting_id=meeting.external_meeting_id or str(meeting.id),
                title=meeting.title,
                platform=meeting.platform,
                meeting_url=meeting.meeting_url,
                started_at=meeting.started_at or meeting.scheduled_at,
                ended_at=meeting.ended_at,
                summary=summary,
                transcript=transcript or page_text[:12000],
                action_items=action_items,
                participants=participants,
                raw_payload={
                    **(meeting.raw_report or {}),
                    "recording_ai": {
                        "status": "analyzed",
                        "source_notes": source_notes,
                        "followup_context": ai_payload.get("followup_context", []),
                        "deal_signals": ai_payload.get("deal_signals", []),
                    },
                },
                auto_create_contacts=True,
            ),
        )

        return MeetingRecordingAnalysisResponse(
            meeting_id=meeting.id,
            status="analyzed",
            message="Recording intelligence captured from available transcript/page text.",
            summary=summary,
            action_items=[item.text for item in action_items],
            participants=[participant.model_dump() for participant in participants],
            attendees_added=response.attendees_added,
            contacts_created=response.contacts_created,
            relationship_edges_created=response.relationship_edges_created,
            transcript_available=bool(transcript),
            source_notes=source_notes,
        )

    @staticmethod
    def _fetch_replay_page_text(url: str) -> str:
        response = httpx.get(
            url,
            follow_redirects=True,
            timeout=30,
            headers={
                "User-Agent": "RelateOS recording intelligence/1.0",
                "Accept": "text/html,application/xhtml+xml,text/plain",
            },
        )
        if response.status_code >= 400:
            raise RuntimeError(f"{response.status_code} while fetching replay page")
        text = unescape(response.text)
        text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.IGNORECASE)
        text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
        text = TAG_PATTERN.sub(" ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:20000]

    @staticmethod
    def _ai_extract(db: Session, meeting: Meeting, text: str) -> dict:
        api_key = settings.openai_api_key or ConnectionsService.stored_connector_value(db, "openai", "api_key")
        if not api_key:
            return {
                "summary": meeting.summary,
                "action_items": meeting.action_items or [],
                "participants": [],
            }

        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        prompt = (
            "Analyze this meeting recording text for RelateOS. Extract only facts supported by the text. "
            "If participant emails are not visible, leave email blank. Return JSON with keys: "
            "summary string, action_items array of strings, participants array of objects with name/email/role, "
            "followup_context array of strings, deal_signals array of strings.\n\n"
            f"Meeting title: {meeting.title}\n"
            f"Recording URL: {meeting.meeting_url or ''}\n"
            f"Text:\n{text[:14000]}"
        )
        raw = client.chat.completions.create(
            model=settings.openai_model or "gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            response_format={"type": "json_object"},
        ).choices[0].message.content or "{}"
        try:
            return json.loads(raw)
        except Exception:
            return {"summary": raw[:1000], "action_items": [], "participants": []}

    @staticmethod
    def _mark_analysis_attempt(meeting: Meeting, source_notes: list[str]) -> None:
        raw_report = meeting.raw_report or {}
        raw_report["recording_ai"] = {
            "status": "needs_transcript",
            "source_notes": source_notes,
        }
        meeting.raw_report = raw_report

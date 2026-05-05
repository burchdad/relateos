import uuid
from datetime import datetime, timezone
import json
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import EngagementEvent, Person
from app.schemas.engagement import EngagementCaptureRequest, EngagementEventCreate, EngagementImportRequest


EVENT_TYPE_ALIASES = {
    "view": "story_view",
    "story": "story_view",
    "story_viewed": "story_view",
    "like": "post_like",
    "commented": "comment",
    "message": "dm",
    "email_clicked": "email_click",
    "webinar": "webinar_attended",
}


def _clean_text(value: str | None) -> str:
    return (value or "").strip()


def _normalize_event_type(value: str) -> str:
    normalized = _clean_text(value).lower().replace("-", "_").replace(" ", "_")
    if not normalized:
        return "interaction"
    return EVENT_TYPE_ALIASES.get(normalized, normalized)


def _normalize_platform(value: str | None) -> str | None:
    cleaned = _clean_text(value).lower()
    return cleaned or None


def _heuristic_intel(
    *,
    event_type: str,
    source_platform: str | None,
    name: str | None,
    notes: str | None,
    raw_payload: dict[str, Any],
) -> dict[str, Any]:
    engagement_value_map = {
        "form_submit": 0.95,
        "email_reply": 0.9,
        "call": 0.88,
        "dm": 0.85,
        "webinar_attended": 0.82,
        "podcast_clip_view": 0.62,
        "comment": 0.58,
        "post_like": 0.42,
        "story_view": 0.35,
        "email_open": 0.3,
    }
    intent_map = {
        "form_submit": "high_intent",
        "email_reply": "high_intent",
        "dm": "high_intent",
        "call": "high_intent",
        "webinar_attended": "warm",
        "comment": "warm",
        "post_like": "light",
        "story_view": "light",
        "email_open": "light",
    }
    suggested_action_map = {
        "form_submit": "Reach out within 24 hours with a clear next step.",
        "email_reply": "Respond quickly and move to a scheduled call.",
        "dm": "Reply in-channel, then move to email or phone.",
        "call": "Log call outcomes and schedule the next touchpoint.",
        "webinar_attended": "Send follow-up recap and ask one qualification question.",
        "comment": "Acknowledge and continue the thread with a CTA.",
        "post_like": "Send a lightweight follow-up if this repeats.",
        "story_view": "Track frequency before direct outreach.",
    }

    actor = _clean_text(name) or _clean_text(str(raw_payload.get("name") or "")) or "Contact"
    platform_label = source_platform or "unknown platform"
    notes_clean = _clean_text(notes)
    base_summary = f"{actor} triggered {event_type.replace('_', ' ')} on {platform_label}."
    if notes_clean:
        base_summary += f" Notes: {notes_clean[:220]}"

    tags = [event_type]
    if source_platform:
        tags.append(f"platform:{source_platform}")
    if "campaign_id" in raw_payload:
        tags.append("campaign_attributed")
    if notes_clean:
        tags.append("has_notes")

    return {
        "summary": base_summary,
        "intent": intent_map.get(event_type, "unknown"),
        "engagement_value": engagement_value_map.get(event_type, 0.5),
        "suggested_next_action": suggested_action_map.get(
            event_type,
            "Review this event and determine the right follow-up channel.",
        ),
        "tags": tags,
        "confidence": 0.65,
    }


class EngagementService:
    _openai_client: OpenAI | None = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    @staticmethod
    def _touch_contact_engagement(db: Session, contact_id: uuid.UUID | None, occurred_at: datetime) -> None:
        if not contact_id:
            return
        person = db.query(Person).filter(Person.id == contact_id).first()
        if not person:
            return
        if person.last_engaged_at is None or occurred_at > person.last_engaged_at:
            person.last_engaged_at = occurred_at

    @staticmethod
    def _ai_intel(
        *,
        event_type: str,
        source_platform: str | None,
        name: str | None,
        notes: str | None,
        raw_payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not EngagementService._openai_client:
            return None

        prompt = {
            "event_type": event_type,
            "source_platform": source_platform,
            "name": name,
            "notes": notes,
            "raw_payload": raw_payload,
        }
        try:
            response = EngagementService._openai_client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.2,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You enrich engagement events for a CRM. Return JSON only with keys: "
                            "summary, intent, engagement_value, suggested_next_action, tags, confidence. "
                            "confidence and engagement_value must be numbers from 0 to 1."
                        ),
                    },
                    {"role": "user", "content": json.dumps(prompt)},
                ],
            )
            content = response.choices[0].message.content if response.choices else ""
            parsed = json.loads(content or "{}")
            if not isinstance(parsed, dict):
                return None
            return parsed
        except Exception:
            return None

    @staticmethod
    def _enrich_event(
        *,
        event_type: str,
        source_platform: str | None,
        name: str | None,
        notes: str | None,
        raw_payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any]]:
        heuristic = _heuristic_intel(
            event_type=event_type,
            source_platform=source_platform,
            name=name,
            notes=notes,
            raw_payload=raw_payload,
        )
        ai = EngagementService._ai_intel(
            event_type=event_type,
            source_platform=source_platform,
            name=name,
            notes=notes,
            raw_payload=raw_payload,
        )

        summary = str((ai or {}).get("summary") or heuristic["summary"])
        enriched_payload = {
            **raw_payload,
            "event_intel": {
                "heuristic": heuristic,
                "ai": ai,
                "selected": {
                    "intent": (ai or {}).get("intent") or heuristic["intent"],
                    "engagement_value": float((ai or {}).get("engagement_value") or heuristic["engagement_value"]),
                    "suggested_next_action": (ai or {}).get("suggested_next_action") or heuristic["suggested_next_action"],
                    "tags": (ai or {}).get("tags") or heuristic["tags"],
                    "confidence": float((ai or {}).get("confidence") or heuristic["confidence"]),
                },
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "captured_by": "ai_enrichment_pipeline",
            },
        }
        return summary, enriched_payload

    @staticmethod
    def create(db: Session, payload: EngagementEventCreate) -> EngagementEvent:
        normalized_type = _normalize_event_type(payload.event_type)
        platform = _normalize_platform(payload.source_platform)
        occurred_at = payload.occurred_at or datetime.now(timezone.utc)
        summary, enriched_payload = EngagementService._enrich_event(
            event_type=normalized_type,
            source_platform=platform,
            name=None,
            notes=payload.summary,
            raw_payload=payload.raw_payload or {},
        )
        event = EngagementEvent(
            id=uuid.uuid4(),
            contact_id=payload.contact_id,
            organization_id=payload.organization_id,
            event_type=normalized_type,
            source_platform=platform,
            raw_payload=enriched_payload,
            summary=payload.summary or summary,
            occurred_at=occurred_at,
        )
        db.add(event)
        EngagementService._touch_contact_engagement(db, payload.contact_id, occurred_at)
        db.commit()
        db.refresh(event)
        return event

    @staticmethod
    def list_all(db: Session, contact_id: uuid.UUID | None = None, limit: int = 100) -> list[EngagementEvent]:
        q = db.query(EngagementEvent)
        if contact_id:
            q = q.filter(EngagementEvent.contact_id == contact_id)
        return q.order_by(EngagementEvent.occurred_at.desc()).limit(limit).all()

    @staticmethod
    def bulk_import(db: Session, payload: EngagementImportRequest) -> dict:
        created_events = 0
        created_contacts = 0
        for row in payload.rows:
            contact_id = None
            if row.email and payload.auto_create_contacts:
                from app.services.contact_service import ContactService
                contact = ContactService.find_or_create_by_email(db, row.email, row.name)
                contact_id = contact.id
                if contact.source is None:
                    contact.source = "import"
                    db.commit()
                if contact.last_engaged_at is None:
                    created_contacts += 1

            normalized_type = _normalize_event_type(row.event_type)
            platform = _normalize_platform(row.source_platform)
            occurred_at = row.occurred_at or datetime.now(timezone.utc)
            base_payload = {
                "name": row.name,
                "email": row.email,
            }
            summary, enriched_payload = EngagementService._enrich_event(
                event_type=normalized_type,
                source_platform=platform,
                name=row.name,
                notes=row.notes,
                raw_payload=base_payload,
            )

            event = EngagementEvent(
                id=uuid.uuid4(),
                contact_id=contact_id,
                event_type=normalized_type,
                source_platform=platform,
                summary=row.notes or summary,
                occurred_at=occurred_at,
                raw_payload=enriched_payload,
            )
            db.add(event)
            EngagementService._touch_contact_engagement(db, contact_id, occurred_at)
            created_events += 1

        db.commit()
        return {"events_created": created_events, "contacts_created": created_contacts}

    @staticmethod
    def capture(db: Session, payload: EngagementCaptureRequest) -> dict[str, Any]:
        contact_id = None
        if payload.email and payload.auto_create_contact:
            from app.services.contact_service import ContactService

            contact = ContactService.find_or_create_by_email(db, payload.email, payload.name)
            contact_id = contact.id
            if contact.source is None:
                contact.source = "capture"

        event_payload = EngagementEventCreate(
            contact_id=contact_id,
            event_type=payload.event_type,
            source_platform=payload.source_platform,
            summary=payload.notes,
            occurred_at=payload.occurred_at,
            raw_payload={
                **(payload.raw_payload or {}),
                "name": payload.name,
                "email": payload.email,
            },
        )
        event = EngagementService.create(db, event_payload)
        return {
            "id": str(event.id),
            "contact_id": str(event.contact_id) if event.contact_id else None,
            "event_type": event.event_type,
            "source_platform": event.source_platform,
            "summary": event.summary,
        }

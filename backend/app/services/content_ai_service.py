import logging
from uuid import UUID

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ContentInsight
from app.services.content_service import ContentService

logger = logging.getLogger(__name__)


class ContentAIService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    def _fallback(self, title: str, description: str) -> tuple[str, list[str], list[str]]:
        clean_description = " ".join(description.split())
        summary = f"{title}: {clean_description[:220]}" if clean_description else title
        key_points = [
            f"Core topic: {title}",
            "Use this content to start a relevant 1:1 conversation.",
            "Pair with a specific follow-up ask within 48 hours.",
        ]
        suggested_angles = [
            "Share the replay with one practical takeaway.",
            "Ask how this maps to their current goals.",
            "Offer a short call to turn insight into action.",
        ]
        return summary, key_points, suggested_angles

    def generate_content_summary(self, db: Session, content_id: UUID) -> ContentInsight:
        item = ContentService.get_content_by_id(db, content_id)
        if not item:
            raise ValueError("Content item not found")

        summary: str
        key_points: list[str]
        suggested_angles: list[str]

        if self.client:
            try:
                prompt = (
                    "You are a relationship marketing strategist. Return compact JSON with exactly keys: "
                    "summary (string), key_points (array of 3-5 strings), suggested_angles (array of 3-5 strings). "
                    "No markdown.\n\n"
                    f"Title: {item.title}\n"
                    f"Description: {item.description}\n"
                    f"Source type: {item.source_type}\n"
                )
                response = self.client.responses.create(
                    model=settings.openai_model,
                    input=prompt,
                    temperature=0.2,
                )
                raw = (response.output_text or "").strip()
                import json

                parsed = json.loads(raw)
                summary = str(parsed.get("summary", "")).strip()
                key_points = [str(x).strip() for x in parsed.get("key_points", []) if str(x).strip()]
                suggested_angles = [str(x).strip() for x in parsed.get("suggested_angles", []) if str(x).strip()]
                if not summary or not key_points or not suggested_angles:
                    raise ValueError("Model output missing required fields")
            except Exception as exc:
                logger.warning("Content summary generation failed, using fallback: %s", exc)
                summary, key_points, suggested_angles = self._fallback(item.title, item.description)
        else:
            summary, key_points, suggested_angles = self._fallback(item.title, item.description)

        insight = ContentInsight(
            content_id=item.id,
            summary=summary,
            key_points=key_points,
            suggested_angles=suggested_angles,
        )
        db.add(insight)
        db.commit()
        db.refresh(insight)
        return insight

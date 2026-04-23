from urllib.parse import parse_qs, urlparse
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import ContentInsight, ContentItem, ContentRelationshipTarget
from app.schemas.content import ContentCreate


def _extract_youtube_video_id(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return None

    host = (parsed.netloc or "").lower()
    if "youtu.be" in host:
        path_parts = [p for p in parsed.path.split("/") if p]
        return path_parts[0] if path_parts else None

    if "youtube.com" in host:
        if parsed.path == "/watch":
            query = parse_qs(parsed.query)
            return query.get("v", [None])[0]
        if parsed.path.startswith("/embed/"):
            return parsed.path.split("/embed/", 1)[1].split("/")[0]

    return None


def _youtube_thumbnail(url: str) -> str | None:
    video_id = _extract_youtube_video_id(url)
    if not video_id:
        return None
    return f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"


class ContentService:
    @staticmethod
    def create_content_item(db: Session, payload: ContentCreate) -> ContentItem:
        thumbnail_url = payload.thumbnail_url
        if payload.source_type == "youtube" and not thumbnail_url:
            thumbnail_url = _youtube_thumbnail(payload.source_url)

        item = ContentItem(
            title=payload.title.strip(),
            description=payload.description.strip(),
            source_type=payload.source_type,
            source_url=payload.source_url.strip(),
            thumbnail_url=thumbnail_url,
            owner_user_id=payload.owner_user_id,
            experiment_key=payload.experiment_key.strip() if payload.experiment_key else None,
            experiment_variant=payload.experiment_variant,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def get_all_content_items(db: Session) -> list[ContentItem]:
        return db.query(ContentItem).order_by(ContentItem.created_at.desc()).all()

    @staticmethod
    def get_content_by_id(db: Session, content_id: UUID) -> ContentItem | None:
        return db.query(ContentItem).filter(ContentItem.id == content_id).first()

    @staticmethod
    def latest_insight(db: Session, content_id: UUID) -> ContentInsight | None:
        return (
            db.query(ContentInsight)
            .filter(ContentInsight.content_id == content_id)
            .order_by(ContentInsight.created_at.desc())
            .first()
        )

    @staticmethod
    def content_campaign_stats(db: Session, content_id: UUID) -> dict | None:
        item = ContentService.get_content_by_id(db, content_id)
        if not item:
            return None

        targets = db.query(ContentRelationshipTarget).filter(ContentRelationshipTarget.content_id == content_id).all()
        sent = len([t for t in targets if t.engagement_status in {"sent", "responded", "ignored"}])
        responded = len([t for t in targets if t.engagement_status == "responded"])
        ignored = len([t for t in targets if t.engagement_status == "ignored"])
        pending = len([t for t in targets if t.engagement_status == "pending"])
        return {
            "content_id": item.id,
            "title": item.title,
            "experiment_key": item.experiment_key,
            "experiment_variant": item.experiment_variant,
            "sent_count": sent,
            "responded_count": responded,
            "ignored_count": ignored,
            "pending_count": pending,
        }

    @staticmethod
    def active_campaigns(db: Session, limit: int = 8) -> list[dict]:
        items = ContentService.get_all_content_items(db)[:limit]
        return [payload for payload in (ContentService.content_campaign_stats(db, item.id) for item in items) if payload is not None]

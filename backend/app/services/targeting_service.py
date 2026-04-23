from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models import ContentItem, ContentRelationshipTarget, Relationship, RelationshipSignal


POSITIVE_SIGNAL_BOOSTS = {
    "ACTIVE_DEAL": 7.0,
    "RECENT_REPLY": 4.0,
    "FOLLOW_UP_DUE": 5.0,
    "HIGH_VALUE_CONTACT": 3.0,
}


class TargetingService:
    @staticmethod
    def _tokenize(value: str) -> set[str]:
        tokens = [part.strip(".,!?;:()[]{}\"").lower() for part in value.split()]
        return {token for token in tokens if len(token) >= 3}

    @staticmethod
    def _score_relationship(content: ContentItem, relationship: Relationship) -> tuple[float, str]:
        score = 0.0
        reasons: list[str] = []

        text = f"{content.title} {content.description}".lower()
        rel_type = (relationship.type or "").lower()
        if rel_type and rel_type in text:
            score += 8.0
            reasons.append(f"Content matches relationship type ({relationship.type}).")

        metadata = relationship.person.metadata_json if relationship.person else {}
        interests = str(metadata.get("interests") or "")
        content_tokens = TargetingService._tokenize(text)
        interest_tokens = TargetingService._tokenize(interests)
        overlap = content_tokens.intersection(interest_tokens)
        if overlap:
            overlap_count = min(6, len(overlap))
            score += 4.0 + overlap_count
            examples = ", ".join(sorted(list(overlap))[:3])
            reasons.append(f"Interest overlap detected ({examples}).")

        for signal in relationship.signals:
            boost = POSITIVE_SIGNAL_BOOSTS.get(signal.signal_key)
            if boost:
                score += boost
                reasons.append(signal.reason)

        score += max(0.0, float(relationship.priority_score or 0.0) / 12.0)

        if not reasons:
            reasons.append("High potential fit based on current relationship context.")

        return score, " ".join(reasons)

    @staticmethod
    def suggest_relationship_targets(db: Session, content_id: UUID) -> list[ContentRelationshipTarget]:
        content = db.query(ContentItem).filter(ContentItem.id == content_id).first()
        if not content:
            raise ValueError("Content item not found")

        relationships = (
            db.query(Relationship)
            .options(joinedload(Relationship.person), joinedload(Relationship.signals))
            .order_by(Relationship.priority_score.desc())
            .all()
        )

        scored: list[tuple[float, Relationship, str]] = []
        for relationship in relationships:
            score, reason = TargetingService._score_relationship(content, relationship)
            if score > 0:
                scored.append((score, relationship, reason))

        scored.sort(key=lambda item: item[0], reverse=True)
        if not scored:
            db.query(ContentRelationshipTarget).filter(ContentRelationshipTarget.content_id == content.id).delete()
            db.commit()
            return []

        limit = min(20, max(5, len(scored)))
        selected = scored[:limit]

        db.query(ContentRelationshipTarget).filter(ContentRelationshipTarget.content_id == content.id).delete()

        output: list[ContentRelationshipTarget] = []
        for _, relationship, reason in selected:
            row = ContentRelationshipTarget(
                content_id=content.id,
                relationship_id=relationship.id,
                reason=reason,
            )
            output.append(row)
            db.add(row)

            # Optional light integration: mark that content was recently shared with this relationship.
            existing_recent_signal = (
                db.query(RelationshipSignal)
                .filter(
                    RelationshipSignal.relationship_id == relationship.id,
                    RelationshipSignal.signal_key == "CONTENT_SHARED_RECENTLY",
                    RelationshipSignal.detected_at >= datetime.now(timezone.utc) - timedelta(days=7),
                )
                .first()
            )
            if not existing_recent_signal:
                db.add(
                    RelationshipSignal(
                        relationship_id=relationship.id,
                        signal_key="CONTENT_SHARED_RECENTLY",
                        weight=-3.0,
                        magnitude=1.0,
                        reason=f"Content '{content.title}' was targeted for this relationship.",
                        detected_at=datetime.now(timezone.utc),
                    )
                )

        db.commit()

        for row in output:
            db.refresh(row)

        return output

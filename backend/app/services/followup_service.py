from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import ContentRelationshipTarget, Relationship, RelationshipSignal
from app.core.config import settings
from app.schemas.interaction import InteractionCreate
from app.services.ai_service import AIService
from app.services.content_service import ContentService
from app.services.interaction_service import InteractionService
from app.services.targeting_service import TargetingService


FOLLOWUP_PLAN = [
    {"day_offset": 0, "label": "Day 0: Send replay", "goal": "send the replay and ask for one reaction"},
    {"day_offset": 2, "label": "Day 2: Send clip", "goal": "share one short clip and ask if they want details"},
    {"day_offset": 5, "label": "Day 5: Check-in", "goal": "check in and ask for a concrete next step"},
]


class FollowUpSuggestionService:
    @staticmethod
    def _execute_single_target_followup(db: Session, content, plan: dict, target: ContentRelationshipTarget) -> None:
        ai_service = AIService()
        now = datetime.now(timezone.utc)

        message = ai_service.generate_message_suggestion_with_style(
            db,
            target.relationship_id,
            goal=f"{plan['goal']} related to this content: {content.title}",
            style_override={"length": "short"},
        )
        InteractionService.log_interaction(
            db,
            InteractionCreate(
                relationship_id=target.relationship_id,
                type="note",
                content=message,
                summary=f"Content follow-up sent ({plan['label']}) for '{content.title}'",
                sentiment=0.8,
            ),
        )

        target.engagement_status = "sent"
        target.delivery_count = int(target.delivery_count or 0) + 1
        target.last_sent_at = now

        db.add(
            RelationshipSignal(
                relationship_id=target.relationship_id,
                signal_key="CONTENT_SHARED_RECENTLY",
                weight=-3.0,
                magnitude=1.0,
                reason=f"Content '{content.title}' follow-up sent ({plan['label']}).",
                detected_at=now,
            )
        )

    @staticmethod
    def _load_targets(db: Session, content_id: UUID) -> list[ContentRelationshipTarget]:
        targets = (
            db.query(ContentRelationshipTarget)
            .filter(ContentRelationshipTarget.content_id == content_id)
            .order_by(ContentRelationshipTarget.created_at.desc())
            .all()
        )
        if targets:
            return targets
        return TargetingService.suggest_relationship_targets(db, content_id)

    @staticmethod
    def generate_content_followups(db: Session, content_id: UUID) -> dict:
        content = ContentService.get_content_by_id(db, content_id)
        if not content:
            raise ValueError("Content item not found")

        targets = FollowUpSuggestionService._load_targets(db, content_id)
        target_relationship_ids = [target.relationship_id for target in targets]

        relationships = (
            db.query(Relationship)
            .filter(Relationship.id.in_(target_relationship_ids))
            .all()
            if target_relationship_ids
            else []
        )
        relationship_by_id = {relationship.id: relationship for relationship in relationships}

        target_payload = []
        for target in targets:
            relationship = relationship_by_id.get(target.relationship_id)
            name = "Unknown contact"
            if relationship and relationship.person:
                name = f"{relationship.person.first_name} {relationship.person.last_name}"
            target_payload.append(
                {
                    "relationship_id": target.relationship_id,
                    "name": name,
                    "reason": target.reason,
                }
            )

        ai_service = AIService()
        anchor_target = targets[0] if targets else None

        steps = []
        for step in FOLLOWUP_PLAN:
            message = (
                f"Share '{content.title}' and ask for a quick response."
                if not anchor_target
                else ai_service.generate_message_suggestion_with_style(
                    db,
                    anchor_target.relationship_id,
                    goal=f"{step['goal']} related to this content: {content.title}",
                    style_override={"length": "short"},
                )
            )
            steps.append(
                {
                    "day_offset": step["day_offset"],
                    "label": step["label"],
                    "suggested_message": message,
                    "targets": target_payload,
                }
            )

        return {
            "content_id": content.id,
            "steps": steps,
        }

    @staticmethod
    def execute_followup_step(
        db: Session,
        content_id: UUID,
        day_offset: int,
        relationship_ids: list[UUID] | None = None,
        dispatch_mode: str = "immediate",
        delay_window_minutes: int = 0,
    ) -> dict:
        content = ContentService.get_content_by_id(db, content_id)
        if not content:
            raise ValueError("Content item not found")

        plan = next((item for item in FOLLOWUP_PLAN if item["day_offset"] == day_offset), None)
        if not plan:
            raise ValueError("Follow-up step not found")

        targets = FollowUpSuggestionService._load_targets(db, content_id)
        if relationship_ids:
            allowed = set(relationship_ids)
            targets = [target for target in targets if target.relationship_id in allowed]

        if len(targets) > settings.content_bulk_send_max:
            raise ValueError(
                f"Bulk send limit exceeded: selected {len(targets)} targets, max allowed is {settings.content_bulk_send_max}."
            )

        if dispatch_mode not in {"immediate", "queued"}:
            raise ValueError("Unsupported dispatch mode")

        executed_ids: list[UUID] = []
        queued_ids: list[UUID] = []

        if dispatch_mode == "queued":
            if delay_window_minutes <= 0:
                raise ValueError("Queued dispatch requires delay_window_minutes > 0")
            from app.workers.tasks import dispatch_content_followup_task

            total_targets = len(targets)
            window_seconds = delay_window_minutes * 60
            for index, target in enumerate(targets):
                countdown = 0
                if total_targets > 1:
                    countdown = int((window_seconds * index) / (total_targets - 1))
                dispatch_content_followup_task.apply_async(
                    kwargs={
                        "content_id": str(content_id),
                        "day_offset": day_offset,
                        "relationship_id": str(target.relationship_id),
                    },
                    countdown=countdown,
                )
                queued_ids.append(target.relationship_id)
            db.commit()
        else:
            for target in targets:
                FollowUpSuggestionService._execute_single_target_followup(db, content, plan, target)
                executed_ids.append(target.relationship_id)
            db.commit()

        return {
            "content_id": content.id,
            "day_offset": day_offset,
            "executed_count": len(executed_ids),
            "queued_count": len(queued_ids),
            "dispatch_mode": dispatch_mode,
            "relationship_ids": executed_ids or queued_ids,
        }

    @staticmethod
    def dispatch_followup_for_relationship(db: Session, content_id: UUID, day_offset: int, relationship_id: UUID) -> bool:
        content = ContentService.get_content_by_id(db, content_id)
        if not content:
            return False

        plan = next((item for item in FOLLOWUP_PLAN if item["day_offset"] == day_offset), None)
        if not plan:
            return False

        target = (
            db.query(ContentRelationshipTarget)
            .filter(
                ContentRelationshipTarget.content_id == content_id,
                ContentRelationshipTarget.relationship_id == relationship_id,
            )
            .first()
        )
        if not target:
            return False

        FollowUpSuggestionService._execute_single_target_followup(db, content, plan, target)
        db.commit()
        return True

    @staticmethod
    def update_engagement_status(db: Session, content_id: UUID, relationship_id: UUID, status: str) -> ContentRelationshipTarget:
        target = (
            db.query(ContentRelationshipTarget)
            .filter(
                ContentRelationshipTarget.content_id == content_id,
                ContentRelationshipTarget.relationship_id == relationship_id,
            )
            .first()
        )
        if not target:
            raise ValueError("Content target not found")

        if status not in {"responded", "ignored"}:
            raise ValueError("Unsupported engagement status")

        now = datetime.now(timezone.utc)
        target.engagement_status = status
        target.last_engagement_at = now

        if status == "responded":
            signal_key = "CONTENT_ENGAGED_RECENTLY"
            weight = 9.0
            reason = "Contact engaged after content was shared."
        else:
            signal_key = "CONTENT_IGNORED_RECENTLY"
            weight = 4.0
            reason = "Contact did not engage after content was shared."

        db.add(
            RelationshipSignal(
                relationship_id=relationship_id,
                signal_key=signal_key,
                weight=weight,
                magnitude=1.0,
                reason=reason,
                detected_at=now,
            )
        )
        db.commit()
        db.refresh(target)
        return target

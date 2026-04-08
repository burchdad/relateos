from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models import AIInsight, Interaction, Opportunity, Person, Relationship, RelationshipSignal
from app.schemas.relationship import RelationshipCreate


STATUS_TO_STRENGTH = {
    "cold": 0.25,
    "active": 0.6,
    "hot": 0.85,
    "past_deal": 0.7,
}


def _last_contacted_at_from_timing(last_interaction_timing: str) -> datetime:
    now = datetime.now(timezone.utc)
    if last_interaction_timing == "today":
        return now
    if last_interaction_timing == "this_week":
        return now - timedelta(days=3)
    return now - timedelta(days=24)


def _next_suggested_action_at(last_interaction_timing: str) -> datetime:
    now = datetime.now(timezone.utc)
    if last_interaction_timing == "stale":
        return now
    if last_interaction_timing == "this_week":
        return now + timedelta(days=3)
    return now + timedelta(days=7)


class RelationshipService:
    @staticmethod
    def create_person_and_relationship(db: Session, payload: RelationshipCreate) -> Relationship:
        person_metadata = {
            **(payload.person.metadata or {}),
            "interests": payload.interests,
            "current_status": payload.current_status,
            "last_interaction_timing": payload.last_interaction_timing,
        }
        person_tags = {
            **(payload.person.tags or {}),
            "role": payload.type,
            "status": payload.current_status,
        }

        person = Person(
            first_name=payload.person.first_name,
            last_name=payload.person.last_name,
            email=payload.person.email,
            phone=payload.person.phone,
            tags=person_tags,
            metadata_json=person_metadata,
        )
        db.add(person)
        db.flush()

        relationship_strength = payload.relationship_strength
        if relationship_strength is None:
            relationship_strength = STATUS_TO_STRENGTH[payload.current_status]

        lifecycle_stage = payload.lifecycle_stage or payload.current_status
        last_contacted_at = _last_contacted_at_from_timing(payload.last_interaction_timing)

        relationship = Relationship(
            person_id=person.id,
            type=payload.type,
            lifecycle_stage=lifecycle_stage,
            relationship_strength=relationship_strength,
            owner_user_id=payload.owner_user_id,
            last_contacted_at=last_contacted_at,
            next_suggested_action_at=_next_suggested_action_at(payload.last_interaction_timing),
        )
        db.add(relationship)

        initial_interaction = Interaction(
            relationship=relationship,
            type="note",
            content=(
                "Initial context added: "
                f"{payload.type} contact, status {payload.current_status.replace('_', ' ')}, "
                f"interested in {payload.interests}."
            ),
            summary="Initial context added",
            sentiment=0.7 if payload.current_status in {"active", "hot"} else 0.55,
        )
        db.add(initial_interaction)

        db.commit()
        db.refresh(relationship)
        return relationship

    @staticmethod
    def get_by_id(db: Session, relationship_id):
        return (
            db.query(Relationship)
            .options(joinedload(Relationship.person))
            .filter(Relationship.id == relationship_id)
            .first()
        )

    @staticmethod
    def list_all(db: Session):
        return db.query(Relationship).options(joinedload(Relationship.person)).order_by(Relationship.created_at.desc()).all()

    @staticmethod
    def update_lifecycle_stage(db: Session, relationship_id, lifecycle_stage: str):
        rel = db.query(Relationship).filter(Relationship.id == relationship_id).first()
        if not rel:
            return None
        rel.lifecycle_stage = lifecycle_stage
        db.commit()
        db.refresh(rel)
        return rel

    @staticmethod
    def delete_relationship(db: Session, relationship_id: UUID) -> bool:
        deleted = RelationshipService.bulk_delete_relationships(db, relationship_ids=[relationship_id], delete_all=False)
        return deleted > 0

    @staticmethod
    def bulk_delete_relationships(
        db: Session,
        relationship_ids: list[UUID] | None = None,
        delete_all: bool = False,
    ) -> int:
        if delete_all:
            target_relationships = db.query(Relationship).all()
        else:
            ids = list({rid for rid in (relationship_ids or [])})
            if not ids:
                return 0
            target_relationships = db.query(Relationship).filter(Relationship.id.in_(ids)).all()

        if not target_relationships:
            return 0

        target_ids = [rel.id for rel in target_relationships]
        person_ids = list({rel.person_id for rel in target_relationships})

        try:
            db.query(Interaction).filter(Interaction.relationship_id.in_(target_ids)).delete(synchronize_session=False)
            db.query(Opportunity).filter(Opportunity.relationship_id.in_(target_ids)).delete(synchronize_session=False)
            db.query(AIInsight).filter(AIInsight.relationship_id.in_(target_ids)).delete(synchronize_session=False)
            db.query(RelationshipSignal).filter(RelationshipSignal.relationship_id.in_(target_ids)).delete(
                synchronize_session=False
            )
            db.query(Relationship).filter(Relationship.id.in_(target_ids)).delete(synchronize_session=False)

            for person_id in person_ids:
                has_remaining_relationships = (
                    db.query(Relationship.id).filter(Relationship.person_id == person_id).first() is not None
                )
                if not has_remaining_relationships:
                    db.query(Person).filter(Person.id == person_id).delete(synchronize_session=False)

            db.commit()
            return len(target_ids)
        except Exception:
            db.rollback()
            raise

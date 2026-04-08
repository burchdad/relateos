from sqlalchemy.orm import Session, joinedload

from app.models import Person, Relationship
from app.schemas.relationship import RelationshipCreate


class RelationshipService:
    @staticmethod
    def create_person_and_relationship(db: Session, payload: RelationshipCreate) -> Relationship:
        person = Person(
            first_name=payload.person.first_name,
            last_name=payload.person.last_name,
            email=payload.person.email,
            phone=payload.person.phone,
            tags=payload.person.tags,
            metadata_json=payload.person.metadata,
        )
        db.add(person)
        db.flush()

        relationship = Relationship(
            person_id=person.id,
            type=payload.type,
            lifecycle_stage=payload.lifecycle_stage,
            relationship_strength=payload.relationship_strength,
            owner_user_id=payload.owner_user_id,
        )
        db.add(relationship)
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

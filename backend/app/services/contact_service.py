import uuid
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.taxonomy import normalize_role, role_metadata
from app.models.entities import Person
from app.schemas.contact import ContactCreate, ContactUpdate


def _taxonomy_for_role(primary_role: str | None) -> tuple[str | None, str | None, str | None]:
    normalized_role = normalize_role(primary_role)
    metadata = role_metadata(normalized_role)
    return normalized_role, metadata.get("role_family"), metadata.get("market_segment")


class ContactService:
    @staticmethod
    def _attach_relationship_context(people: list[Person], workspace_id: uuid.UUID | None = None) -> list[Person]:
        for person in people:
            relationship_rows = person.relationships or []
            if workspace_id:
                relationship_rows = [rel for rel in relationship_rows if rel.workspace_id == workspace_id]
            relationships = sorted(relationship_rows, key=lambda rel: (rel.priority_score or 0.0, rel.updated_at or rel.created_at), reverse=True)
            relationship = relationships[0] if relationships else None
            if not relationship:
                continue

            person.relationship_id = relationship.id
            person.relationship_type = relationship.type
            person.relationship_lifecycle_stage = relationship.lifecycle_stage
            person.relationship_strength = relationship.relationship_strength
            person.priority_score = relationship.priority_score
            person.last_contacted_at = relationship.last_contacted_at
            person.next_suggested_action_at = relationship.next_suggested_action_at
            person.relationship_interests = (person.metadata_json or {}).get("interests") or person.notes_summary

            if not person.primary_role:
                person.primary_role = relationship.type
            if not person.relationship_stage:
                person.relationship_stage = relationship.lifecycle_stage
            if not person.relationship_strength_score:
                person.relationship_strength_score = relationship.relationship_strength
            if not person.last_engaged_at:
                person.last_engaged_at = relationship.last_contacted_at
            if not person.notes_summary:
                person.notes_summary = person.relationship_interests

        return people

    @staticmethod
    def create(db: Session, payload: ContactCreate, workspace_id: uuid.UUID | None = None) -> Person:
        primary_role, role_family, market_segment = _taxonomy_for_role(payload.primary_role)
        person = Person(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone=payload.phone,
            primary_role=primary_role,
            role_family=payload.role_family or role_family,
            market_segment=payload.market_segment or market_segment,
            secondary_roles=payload.secondary_roles,
            organization_id=payload.organization_id,
            source=payload.source,
            relationship_stage=payload.relationship_stage,
            relationship_strength_score=payload.relationship_strength_score or 0.0,
            notes_summary=payload.notes_summary,
            tags=payload.tags,
        )
        db.add(person)
        db.commit()
        db.refresh(person)
        return ContactService._attach_relationship_context([person], workspace_id)[0]

    @staticmethod
    def get_by_id(db: Session, contact_id: uuid.UUID, workspace_id: uuid.UUID | None = None) -> Person | None:
        q = db.query(Person).filter(Person.id == contact_id)
        if workspace_id:
            q = q.filter(Person.workspace_id == workspace_id)
        person = q.first()
        if not person:
            return None
        return ContactService._attach_relationship_context([person], workspace_id)[0]

    @staticmethod
    def list_all(
        db: Session,
        workspace_id: uuid.UUID | None = None,
        role: str | None = None,
        organization_id: uuid.UUID | None = None,
        relationship_stage: str | None = None,
        source: str | None = None,
        tag: str | None = None,
        search: str | None = None,
        high_value_only: bool = False,
        dormant_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Person]:
        q = db.query(Person)
        if workspace_id:
            q = q.filter(Person.workspace_id == workspace_id)
        if role:
            q = q.filter(Person.primary_role == role)
        if organization_id:
            q = q.filter(Person.organization_id == organization_id)
        if relationship_stage:
            q = q.filter(Person.relationship_stage == relationship_stage)
        if source:
            q = q.filter(Person.source == source)
        if search:
            term = f"%{search}%"
            q = q.filter(
                or_(
                    Person.first_name.ilike(term),
                    Person.last_name.ilike(term),
                    Person.email.ilike(term),
                )
            )
        if high_value_only:
            q = q.filter(Person.lifetime_value > 0).order_by(Person.lifetime_value.desc())
        if dormant_only:
            q = q.filter(Person.relationship_stage == "dormant")
        people = q.order_by(Person.created_at.desc()).offset(offset).limit(limit).all()
        return ContactService._attach_relationship_context(people, workspace_id)

    @staticmethod
    def update(db: Session, contact_id: uuid.UUID, payload: ContactUpdate, workspace_id: uuid.UUID | None = None) -> Person | None:
        q = db.query(Person).filter(Person.id == contact_id)
        if workspace_id:
            q = q.filter(Person.workspace_id == workspace_id)
        person = q.first()
        if not person:
            return None
        updates = payload.model_dump(exclude_unset=True)
        if "primary_role" in updates:
            normalized, role_family, market_segment = _taxonomy_for_role(updates["primary_role"])
            updates["primary_role"] = normalized
            updates.setdefault("role_family", role_family)
            updates.setdefault("market_segment", market_segment)
        for field, value in updates.items():
            setattr(person, field, value)
        db.commit()
        db.refresh(person)
        return person

    @staticmethod
    def delete(db: Session, contact_id: uuid.UUID, workspace_id: uuid.UUID | None = None) -> bool:
        q = db.query(Person).filter(Person.id == contact_id)
        if workspace_id:
            q = q.filter(Person.workspace_id == workspace_id)
        person = q.first()
        if not person:
            return False
        db.delete(person)
        db.commit()
        return True

    @staticmethod
    def find_or_create_by_email(db: Session, email: str, name: str | None = None, workspace_id: uuid.UUID | None = None) -> Person:
        q = db.query(Person).filter(Person.email == email)
        if workspace_id:
            q = q.filter(Person.workspace_id == workspace_id)
        existing = q.first()
        if existing:
            return existing
        parts = (name or "Unknown").split(" ", 1)
        person = Person(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            first_name=parts[0],
            last_name=parts[1] if len(parts) > 1 else "",
            email=email,
            source="import",
        )
        db.add(person)
        db.commit()
        db.refresh(person)
        return person

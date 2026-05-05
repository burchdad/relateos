import uuid
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.entities import Person
from app.schemas.contact import ContactCreate, ContactUpdate


class ContactService:
    @staticmethod
    def create(db: Session, payload: ContactCreate) -> Person:
        person = Person(
            id=uuid.uuid4(),
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone=payload.phone,
            primary_role=payload.primary_role,
            secondary_roles=payload.secondary_roles,
            organization_id=payload.organization_id,
            source=payload.source,
            relationship_stage=payload.relationship_stage,
            notes_summary=payload.notes_summary,
            tags=payload.tags,
        )
        db.add(person)
        db.commit()
        db.refresh(person)
        return person

    @staticmethod
    def get_by_id(db: Session, contact_id: uuid.UUID) -> Person | None:
        return db.query(Person).filter(Person.id == contact_id).first()

    @staticmethod
    def list_all(
        db: Session,
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
        return q.order_by(Person.created_at.desc()).offset(offset).limit(limit).all()

    @staticmethod
    def update(db: Session, contact_id: uuid.UUID, payload: ContactUpdate) -> Person | None:
        person = db.query(Person).filter(Person.id == contact_id).first()
        if not person:
            return None
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(person, field, value)
        db.commit()
        db.refresh(person)
        return person

    @staticmethod
    def delete(db: Session, contact_id: uuid.UUID) -> bool:
        person = db.query(Person).filter(Person.id == contact_id).first()
        if not person:
            return False
        db.delete(person)
        db.commit()
        return True

    @staticmethod
    def find_or_create_by_email(db: Session, email: str, name: str | None = None) -> Person:
        existing = db.query(Person).filter(Person.email == email).first()
        if existing:
            return existing
        parts = (name or "Unknown").split(" ", 1)
        person = Person(
            id=uuid.uuid4(),
            first_name=parts[0],
            last_name=parts[1] if len(parts) > 1 else "",
            email=email,
            source="import",
        )
        db.add(person)
        db.commit()
        db.refresh(person)
        return person

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.entities import EngagementEvent, Person
from app.schemas.engagement import EngagementEventCreate, EngagementImportRequest


class EngagementService:
    @staticmethod
    def create(db: Session, payload: EngagementEventCreate) -> EngagementEvent:
        event = EngagementEvent(
            id=uuid.uuid4(),
            contact_id=payload.contact_id,
            organization_id=payload.organization_id,
            event_type=payload.event_type,
            source_platform=payload.source_platform,
            raw_payload=payload.raw_payload,
            summary=payload.summary,
            occurred_at=payload.occurred_at or datetime.now(timezone.utc),
        )
        db.add(event)
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

            event = EngagementEvent(
                id=uuid.uuid4(),
                contact_id=contact_id,
                event_type=row.event_type,
                source_platform=row.source_platform,
                summary=row.notes,
                occurred_at=row.occurred_at or datetime.now(timezone.utc),
                raw_payload={"name": row.name, "email": row.email},
            )
            db.add(event)
            created_events += 1

        db.commit()
        return {"events_created": created_events, "contacts_created": created_contacts}

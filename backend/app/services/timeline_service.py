import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.entities import EngagementEvent, Interaction, Meeting, MeetingAttendee, Person, Relationship, RelationshipSignal
from app.schemas.interaction import InteractionCreate
from app.schemas.timeline import TimelineCreate
from app.services.interaction_service import InteractionService


def _format_signal_label(signal_key: str) -> str:
    return signal_key.replace("_", " ").title()


def _relationship_for_contact(db: Session, contact_id: uuid.UUID, workspace_id: uuid.UUID) -> Relationship | None:
    return (
        db.query(Relationship)
        .filter(Relationship.person_id == contact_id, Relationship.workspace_id == workspace_id)
        .order_by(Relationship.priority_score.desc(), Relationship.updated_at.desc())
        .first()
    )


def _timeline_sort_value(item: dict) -> float:
    occurred_at = item["occurred_at"]
    if not occurred_at:
        return 0
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
    return occurred_at.timestamp()


class TimelineService:
    @staticmethod
    def contact_timeline(db: Session, contact_id: uuid.UUID, workspace_id: uuid.UUID, limit: int = 50) -> list[dict] | None:
        contact = db.query(Person).filter(Person.id == contact_id, Person.workspace_id == workspace_id).first()
        if not contact:
            return None

        relationships = (
            db.query(Relationship)
            .filter(Relationship.person_id == contact_id, Relationship.workspace_id == workspace_id)
            .all()
        )
        relationship_ids = [relationship.id for relationship in relationships]
        items: list[dict] = []

        if relationship_ids:
            interactions = (
                db.query(Interaction)
                .filter(Interaction.relationship_id.in_(relationship_ids))
                .order_by(Interaction.created_at.desc())
                .limit(limit)
                .all()
            )
            for interaction in interactions:
                items.append(
                    {
                        "id": str(interaction.id),
                        "source": "manual",
                        "type": interaction.type or "note",
                        "title": (interaction.type or "note").replace("_", " ").title(),
                        "body": interaction.summary or interaction.content,
                        "occurred_at": interaction.created_at,
                        "metadata": {"relationship_id": str(interaction.relationship_id), "sentiment": interaction.sentiment},
                    }
                )

            signals = (
                db.query(RelationshipSignal)
                .filter(RelationshipSignal.relationship_id.in_(relationship_ids))
                .order_by(RelationshipSignal.detected_at.desc())
                .limit(limit)
                .all()
            )
            for signal in signals:
                items.append(
                    {
                        "id": str(signal.id),
                        "source": "signal",
                        "type": "relationship_signal",
                        "title": _format_signal_label(signal.signal_key),
                        "body": signal.reason,
                        "occurred_at": signal.detected_at,
                        "metadata": {
                            "relationship_id": str(signal.relationship_id),
                            "weight": float(signal.weight or 0),
                            "magnitude": float(signal.magnitude or 0),
                        },
                    }
                )

        engagement_events = (
            db.query(EngagementEvent)
            .filter(EngagementEvent.workspace_id == workspace_id, EngagementEvent.contact_id == contact_id)
            .order_by(EngagementEvent.occurred_at.desc())
            .limit(limit)
            .all()
        )
        for event in engagement_events:
            items.append(
                {
                    "id": str(event.id),
                    "source": event.source_platform or "engagement",
                    "type": event.event_type,
                    "title": event.event_type.replace("_", " ").title(),
                    "body": event.summary,
                    "occurred_at": event.occurred_at,
                    "metadata": event.raw_payload or {},
                }
            )

        meeting_rows = (
            db.query(Meeting, MeetingAttendee)
            .join(MeetingAttendee, MeetingAttendee.meeting_id == Meeting.id)
            .filter(Meeting.workspace_id == workspace_id, MeetingAttendee.contact_id == contact_id)
            .order_by(Meeting.started_at.desc().nullslast(), Meeting.scheduled_at.desc().nullslast(), Meeting.created_at.desc())
            .limit(limit)
            .all()
        )
        for meeting, attendee in meeting_rows:
            occurred_at = meeting.started_at or meeting.scheduled_at or meeting.created_at or datetime.now(timezone.utc)
            body_parts = [meeting.summary]
            if meeting.action_items:
                body_parts.append("Action items: " + "; ".join(meeting.action_items[:3]))
            items.append(
                {
                    "id": str(attendee.id),
                    "source": meeting.source_provider or meeting.platform or "meeting",
                    "type": "meeting",
                    "title": meeting.title,
                    "body": "\n".join(part for part in body_parts if part),
                    "occurred_at": occurred_at,
                    "metadata": {
                        "meeting_id": str(meeting.id),
                        "attendance_status": attendee.attendance_status,
                        "followup_status": attendee.followup_status,
                    },
                }
            )

        return sorted(items, key=_timeline_sort_value, reverse=True)[:limit]

    @staticmethod
    def log_contact_note(db: Session, contact_id: uuid.UUID, payload: TimelineCreate, workspace_id: uuid.UUID) -> dict:
        contact = db.query(Person).filter(Person.id == contact_id, Person.workspace_id == workspace_id).first()
        if not contact:
            raise ValueError("Contact not found")

        relationship = _relationship_for_contact(db, contact_id, workspace_id)
        if not relationship:
            relationship = Relationship(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                person_id=contact_id,
                type=contact.primary_role or "contact",
                lifecycle_stage=contact.relationship_stage or "new",
                relationship_strength=contact.relationship_strength_score or 0.0,
                priority_score=contact.relationship_strength_score or 0.0,
            )
            db.add(relationship)
            db.flush()

        interaction = InteractionService.log_interaction(
            db,
            InteractionCreate(
                relationship_id=relationship.id,
                type=payload.type,
                content=payload.content,
                summary=payload.summary,
                sentiment=payload.sentiment,
            ),
            workspace_id=workspace_id,
        )
        return {
            "id": str(interaction.id),
            "source": "manual",
            "type": interaction.type or "note",
            "title": (interaction.type or "note").replace("_", " ").title(),
            "body": interaction.summary or interaction.content,
            "occurred_at": interaction.created_at,
            "metadata": {"relationship_id": str(interaction.relationship_id), "sentiment": interaction.sentiment},
        }

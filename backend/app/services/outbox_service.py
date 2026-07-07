import html
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models import AppUser, FollowUpTask, Interaction, OutboxMessage, Person, Relationship
from app.schemas.outbox import OutboxMessageCreate, OutboxMessageUpdate


def _contact_name(contact: Person | None) -> str | None:
    if not contact:
        return None
    name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
    return name or contact.email or None


def _html_body(body: str) -> str:
    paragraphs = [part.strip() for part in (body or "").split("\n\n") if part.strip()]
    if not paragraphs:
        paragraphs = [body or ""]
    rendered = "".join(
        f"<p>{html.escape(part).replace(chr(10), '<br>')}</p>"
        for part in paragraphs
    )
    return (
        "<div style=\"font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1C3A2A;\">"
        f"{rendered}"
        "</div>"
    )


def _serialize_message(message: OutboxMessage) -> dict:
    contact = message.contact or (message.linked_relationship.person if message.linked_relationship else None)
    return {
        "id": message.id,
        "workspace_id": message.workspace_id,
        "task_id": message.task_id,
        "relationship_id": message.relationship_id,
        "contact_id": message.contact_id,
        "contact_name": _contact_name(contact),
        "created_by_user_id": message.created_by_user_id,
        "created_by_name": message.created_by_user.name if message.created_by_user else None,
        "to_email": message.to_email,
        "to_name": message.to_name,
        "subject": message.subject,
        "body": message.body,
        "status": message.status,
        "provider": message.provider,
        "provider_message_id": message.provider_message_id,
        "error_message": message.error_message,
        "sent_at": message.sent_at,
        "metadata_json": message.metadata_json or {},
        "created_at": message.created_at,
        "updated_at": message.updated_at,
    }


class OutboxService:
    @staticmethod
    def _query(db: Session):
        return db.query(OutboxMessage).options(
            joinedload(OutboxMessage.contact),
            joinedload(OutboxMessage.linked_relationship).joinedload(Relationship.person),
            joinedload(OutboxMessage.created_by_user),
        )

    @staticmethod
    def _resolve_context(
        db: Session,
        *,
        workspace_id: uuid.UUID,
        task_id: uuid.UUID | None,
        relationship_id: uuid.UUID | None,
        contact_id: uuid.UUID | None,
    ) -> tuple[FollowUpTask | None, Relationship | None, Person | None]:
        task = None
        relationship = None
        contact = None

        if task_id:
            task = (
                db.query(FollowUpTask)
                .options(
                    joinedload(FollowUpTask.contact),
                    joinedload(FollowUpTask.linked_relationship).joinedload(Relationship.person),
                )
                .filter(FollowUpTask.id == task_id, FollowUpTask.workspace_id == workspace_id)
                .first()
            )
            if not task:
                raise ValueError("Task not found")
            relationship_id = relationship_id or task.relationship_id
            contact_id = contact_id or task.contact_id
            contact = task.contact or (task.linked_relationship.person if task.linked_relationship else None)

        if relationship_id:
            relationship = (
                db.query(Relationship)
                .options(joinedload(Relationship.person))
                .filter(Relationship.id == relationship_id, Relationship.workspace_id == workspace_id)
                .first()
            )
            if not relationship:
                raise ValueError("Relationship not found")
            contact = contact or relationship.person
            contact_id = contact_id or relationship.person_id

        if contact_id and not contact:
            contact = db.query(Person).filter(Person.id == contact_id, Person.workspace_id == workspace_id).first()
            if not contact:
                raise ValueError("Contact not found")

        return task, relationship, contact

    @staticmethod
    def list_messages(
        db: Session,
        *,
        workspace_id: uuid.UUID,
        status: str | None = None,
        task_id: uuid.UUID | None = None,
        contact_id: uuid.UUID | None = None,
        limit: int = 100,
    ) -> list[dict]:
        q = OutboxService._query(db).filter(OutboxMessage.workspace_id == workspace_id)
        if status and status != "all":
            q = q.filter(OutboxMessage.status == status)
        if task_id:
            q = q.filter(OutboxMessage.task_id == task_id)
        if contact_id:
            q = q.filter(OutboxMessage.contact_id == contact_id)
        rows = q.order_by(OutboxMessage.created_at.desc()).limit(limit).all()
        return [_serialize_message(row) for row in rows]

    @staticmethod
    def create_message(db: Session, *, payload: OutboxMessageCreate, workspace_id: uuid.UUID, user: AppUser) -> dict:
        task, relationship, contact = OutboxService._resolve_context(
            db,
            workspace_id=workspace_id,
            task_id=payload.task_id,
            relationship_id=payload.relationship_id,
            contact_id=payload.contact_id,
        )
        to_email = (payload.to_email or (contact.email if contact else "") or "").strip().lower()
        if not to_email:
            raise ValueError("This contact needs an email address before a message can be sent.")

        to_name = (payload.to_name or _contact_name(contact) or "").strip() or None
        message = OutboxMessage(
            id=uuid.uuid4(),
            workspace_id=workspace_id,
            task_id=payload.task_id,
            relationship_id=payload.relationship_id or (task.relationship_id if task else None) or (relationship.id if relationship else None),
            contact_id=payload.contact_id or (task.contact_id if task else None) or (contact.id if contact else None),
            created_by_user_id=user.id,
            to_email=to_email,
            to_name=to_name,
            subject=payload.subject.strip(),
            body=payload.body.strip(),
            status=payload.status if payload.status in {"draft", "ready"} else "draft",
            metadata_json=payload.metadata_json or {},
        )
        db.add(message)
        db.commit()
        message = OutboxService._query(db).filter(OutboxMessage.id == message.id).first()
        return _serialize_message(message)

    @staticmethod
    def update_message(
        db: Session,
        *,
        message_id: uuid.UUID,
        payload: OutboxMessageUpdate,
        workspace_id: uuid.UUID,
    ) -> dict | None:
        message = db.query(OutboxMessage).filter(
            OutboxMessage.id == message_id,
            OutboxMessage.workspace_id == workspace_id,
        ).first()
        if not message:
            return None
        if message.status == "sent":
            raise ValueError("Sent messages cannot be edited.")

        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if value is not None:
                setattr(message, field, value.strip() if isinstance(value, str) else value)
        message.error_message = None
        db.commit()
        message = OutboxService._query(db).filter(OutboxMessage.id == message_id).first()
        return _serialize_message(message)

    @staticmethod
    def send_message(db: Session, *, message_id: uuid.UUID, workspace_id: uuid.UUID, user: AppUser) -> dict | None:
        message = (
            OutboxService._query(db)
            .filter(OutboxMessage.id == message_id, OutboxMessage.workspace_id == workspace_id)
            .first()
        )
        if not message:
            return None
        if message.status == "sent":
            return _serialize_message(message)
        if not settings.resend_api_key:
            message.status = "failed"
            message.error_message = "RESEND_API_KEY is not configured."
            db.commit()
            return _serialize_message(message)

        payload = {
            "from": settings.outbound_email_from,
            "to": [message.to_email],
            "subject": message.subject,
            "html": _html_body(message.body),
            "text": message.body,
        }
        headers = {
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": f"outbox-{message.id}",
        }

        try:
            response = httpx.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            message.status = "sent"
            message.provider = "resend"
            message.provider_message_id = data.get("id")
            message.error_message = None
            message.sent_at = datetime.now(timezone.utc)
        except Exception as exc:
            message.status = "failed"
            message.error_message = str(exc)
            db.commit()
            return _serialize_message(message)

        if message.relationship_id:
            db.add(
                Interaction(
                    id=uuid.uuid4(),
                    relationship_id=message.relationship_id,
                    type="email_sent",
                    content=message.body,
                    summary=f"Sent email: {message.subject}",
                    sentiment=0.7,
                )
            )
        if message.task_id:
            task = db.query(FollowUpTask).filter(
                FollowUpTask.id == message.task_id,
                FollowUpTask.workspace_id == workspace_id,
            ).first()
            if task and task.status != "completed":
                task.status = "completed"
                task.completed_at = datetime.now(timezone.utc)
                task.metadata_json = {
                    **(task.metadata_json or {}),
                    "completed_by_outbox_message_id": str(message.id),
                    "completed_by_user_id": str(user.id),
                }
        db.commit()
        message = OutboxService._query(db).filter(OutboxMessage.id == message_id).first()
        return _serialize_message(message)

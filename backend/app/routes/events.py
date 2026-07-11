import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.schemas.event import EventCreate, EventInviteSendRequest, EventInviteSendResponse, EventOut
from app.services.event_service import EventService


router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventOut, status_code=201)
def create_event(payload: EventCreate, db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("events:write"))):
    return EventService.create_event(db, payload, workspace_id=context.workspace_id)


@router.get("", response_model=list[EventOut])
def get_events(db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("events:read"))):
    return EventService.get_events(db, workspace_id=context.workspace_id)


@router.post("/{event_id}/send-invites", response_model=EventInviteSendResponse)
def send_event_invites(
    event_id: uuid.UUID,
    payload: EventInviteSendRequest,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("events:invite_contacts")),
):
    try:
        result = EventService.send_invites(
            db,
            event_id=event_id,
            contact_ids=payload.contact_ids,
            workspace_id=context.workspace_id,
            user=context.user,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if detail == "Event not found" else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return EventInviteSendResponse(**result)

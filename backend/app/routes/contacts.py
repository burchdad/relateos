import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.core.workspace import workspace_id_for_user
from app.models import AppUser
from app.schemas.contact import ContactBulkDeleteRequest, ContactBulkDeleteResponse, ContactCreate, ContactOut, ContactUpdate
from app.schemas.timeline import TimelineCreate, TimelineItem
from app.services.audit_service import AuditService
from app.services.contact_service import ContactService
from app.services.timeline_service import TimelineService

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
def list_contacts(
    role: Optional[str] = Query(None),
    organization_id: Optional[uuid.UUID] = Query(None),
    relationship_stage: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    high_value_only: bool = Query(False),
    dormant_only: bool = Query(False),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("contacts:read")),
):
    return ContactService.list_all(
        db,
        workspace_id=context.workspace_id,
        role=role,
        organization_id=organization_id,
        relationship_stage=relationship_stage,
        source=source,
        search=search,
        high_value_only=high_value_only,
        dormant_only=dormant_only,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ContactOut, status_code=201)
def create_contact(payload: ContactCreate, db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("contacts:write"))):
    return ContactService.create(db, payload, workspace_id=context.workspace_id)


@router.post("/bulk-delete", response_model=ContactBulkDeleteResponse)
def bulk_delete_contacts(
    payload: ContactBulkDeleteRequest,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("contacts:delete")),
):
    result = ContactService.bulk_delete(db, payload.contact_ids, workspace_id=context.workspace_id)
    AuditService.log(
        db,
        workspace_id=context.workspace_id,
        user=context.user,
        action_type="contact_bulk_delete",
        target_type="contact",
        metadata={
            "requested": len(payload.contact_ids),
            "deleted": result["deleted"],
            "missing": [str(contact_id) for contact_id in result["missing"]],
        },
    )
    return ContactBulkDeleteResponse(**result)


@router.get("/{contact_id}/timeline", response_model=list[TimelineItem])
def contact_timeline(
    contact_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("contacts:read")),
):
    timeline = TimelineService.contact_timeline(db, contact_id, workspace_id=context.workspace_id, limit=limit)
    if timeline is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return timeline


@router.post("/{contact_id}/timeline", response_model=TimelineItem, status_code=201)
def log_contact_timeline(
    contact_id: uuid.UUID,
    payload: TimelineCreate,
    db: Session = Depends(get_db),
    context: WorkspaceContext = Depends(require_permission("contacts:write")),
):
    try:
        return TimelineService.log_contact_note(db, contact_id, payload, workspace_id=context.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{contact_id}", response_model=ContactOut)
def get_contact(contact_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    contact = ContactService.get_by_id(db, contact_id, workspace_id=workspace_id_for_user(db, user))
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.put("/{contact_id}", response_model=ContactOut)
def update_contact(contact_id: uuid.UUID, payload: ContactUpdate, db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("contacts:write"))):
    contact = ContactService.update(db, contact_id, payload, workspace_id=context.workspace_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: uuid.UUID, db: Session = Depends(get_db), context: WorkspaceContext = Depends(require_permission("contacts:delete"))):
    if not ContactService.delete(db, contact_id, workspace_id=context.workspace_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    AuditService.log(
        db,
        workspace_id=context.workspace_id,
        user=context.user,
        action_type="contact_delete",
        target_type="contact",
        target_id=contact_id,
    )

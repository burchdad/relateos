import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.permissions import WorkspaceContext, require_permission
from app.core.workspace import workspace_id_for_user
from app.models import AppUser
from app.schemas.contact import ContactCreate, ContactOut, ContactUpdate
from app.services.contact_service import ContactService

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

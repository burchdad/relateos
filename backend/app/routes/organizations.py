import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.workspace import workspace_id_for_user
from app.models import AppUser
from app.schemas.contact import ContactOut
from app.schemas.deal import DealOut
from app.schemas.organization import OrganizationCreate, OrganizationNetworkSummary, OrganizationOut, OrganizationUpdate
from app.services.organization_service import OrganizationService

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return OrganizationService.list_all(db, workspace_id=workspace_id_for_user(db, user))


@router.post("", response_model=OrganizationOut, status_code=201)
def create_organization(payload: OrganizationCreate, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return OrganizationService.create(db, payload, workspace_id=workspace_id_for_user(db, user))


@router.get("/{org_id}", response_model=OrganizationOut)
def get_organization(org_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    org = OrganizationService.get_by_id(db, org_id, workspace_id=workspace_id_for_user(db, user))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.put("/{org_id}", response_model=OrganizationOut)
def update_organization(org_id: uuid.UUID, payload: OrganizationUpdate, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    org = OrganizationService.update(db, org_id, payload, workspace_id=workspace_id_for_user(db, user))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("/{org_id}/network-summary", response_model=OrganizationNetworkSummary)
def org_network_summary(org_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    summary = OrganizationService.network_summary(db, org_id, workspace_id=workspace_id_for_user(db, user))
    if not summary:
        raise HTTPException(status_code=404, detail="Organization not found")
    return summary


@router.get("/{org_id}/contacts", response_model=list[ContactOut])
def org_contacts(org_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    from app.services.contact_service import ContactService
    return ContactService.list_all(db, organization_id=org_id, workspace_id=workspace_id_for_user(db, user))


@router.get("/{org_id}/deals", response_model=list[DealOut])
def org_deals(org_id: uuid.UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    from app.services.deal_service import DealService

    workspace_id = workspace_id_for_user(db, user)
    if not OrganizationService.get_by_id(db, org_id, workspace_id=workspace_id):
        raise HTTPException(status_code=404, detail="Organization not found")
    return DealService.list_all(db, organization_id=org_id)

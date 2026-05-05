import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.contact import ContactOut
from app.schemas.deal import DealOut
from app.schemas.organization import OrganizationCreate, OrganizationNetworkSummary, OrganizationOut, OrganizationUpdate
from app.services.organization_service import OrganizationService

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db)):
    return OrganizationService.list_all(db)


@router.post("", response_model=OrganizationOut, status_code=201)
def create_organization(payload: OrganizationCreate, db: Session = Depends(get_db)):
    return OrganizationService.create(db, payload)


@router.get("/{org_id}", response_model=OrganizationOut)
def get_organization(org_id: uuid.UUID, db: Session = Depends(get_db)):
    org = OrganizationService.get_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.put("/{org_id}", response_model=OrganizationOut)
def update_organization(org_id: uuid.UUID, payload: OrganizationUpdate, db: Session = Depends(get_db)):
    org = OrganizationService.update(db, org_id, payload)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("/{org_id}/network-summary", response_model=OrganizationNetworkSummary)
def org_network_summary(org_id: uuid.UUID, db: Session = Depends(get_db)):
    summary = OrganizationService.network_summary(db, org_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Organization not found")
    return summary


@router.get("/{org_id}/contacts", response_model=list[ContactOut])
def org_contacts(org_id: uuid.UUID, db: Session = Depends(get_db)):
    from app.services.contact_service import ContactService
    return ContactService.list_all(db, organization_id=org_id)


@router.get("/{org_id}/deals", response_model=list[DealOut])
def org_deals(org_id: uuid.UUID, db: Session = Depends(get_db)):
    from app.services.deal_service import DealService
    return DealService.list_all(db, organization_id=org_id)

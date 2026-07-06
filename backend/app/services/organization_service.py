import uuid

from sqlalchemy.orm import Session

from app.models.entities import Organization
from app.schemas.organization import OrganizationCreate, OrganizationUpdate, OrganizationNetworkSummary


class OrganizationService:
    @staticmethod
    def create(
        db: Session,
        payload: OrganizationCreate,
        workspace_id: uuid.UUID | None = None,
    ) -> Organization:
        org = Organization(id=uuid.uuid4(), workspace_id=workspace_id, **payload.model_dump())
        db.add(org)
        db.commit()
        db.refresh(org)
        return org

    @staticmethod
    def get_by_id(
        db: Session,
        org_id: uuid.UUID,
        workspace_id: uuid.UUID | None = None,
    ) -> Organization | None:
        query = db.query(Organization).filter(Organization.id == org_id)
        if workspace_id:
            query = query.filter(Organization.workspace_id == workspace_id)
        return query.first()

    @staticmethod
    def list_all(db: Session, workspace_id: uuid.UUID | None = None) -> list[Organization]:
        query = db.query(Organization)
        if workspace_id:
            query = query.filter(Organization.workspace_id == workspace_id)
        return query.order_by(Organization.name).all()

    @staticmethod
    def update(
        db: Session,
        org_id: uuid.UUID,
        payload: OrganizationUpdate,
        workspace_id: uuid.UUID | None = None,
    ) -> Organization | None:
        org = OrganizationService.get_by_id(db, org_id, workspace_id=workspace_id)
        if not org:
            return None
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(org, field, value)
        db.commit()
        db.refresh(org)
        return org

    @staticmethod
    def network_summary(
        db: Session,
        org_id: uuid.UUID,
        workspace_id: uuid.UUID | None = None,
    ) -> OrganizationNetworkSummary | None:
        from app.models.entities import Deal, Person

        org = OrganizationService.get_by_id(db, org_id, workspace_id=workspace_id)
        if not org:
            return None

        contact_query = db.query(Person).filter(Person.organization_id == org_id)
        if workspace_id:
            contact_query = contact_query.filter(Person.workspace_id == workspace_id)
        contact_count = contact_query.count()
        deals = db.query(Deal).filter(Deal.organization_id == org_id).all()
        deal_count = len(deals)
        total_revenue = sum(d.actual_value for d in deals)
        active_deals = sum(1 for d in deals if d.status not in ("closed_won", "closed_lost", "dormant"))
        top_contacts = contact_query.order_by(Person.lifetime_value.desc()).limit(5).all()
        return OrganizationNetworkSummary(
            organization_id=org_id,
            name=org.name,
            contact_count=contact_count,
            deal_count=deal_count,
            total_revenue=total_revenue,
            active_deals=active_deals,
            top_contacts=[
                {"id": str(c.id), "name": f"{c.first_name} {c.last_name}", "lifetime_value": c.lifetime_value}
                for c in top_contacts
            ],
        )

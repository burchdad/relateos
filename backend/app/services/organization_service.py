import uuid

from sqlalchemy.orm import Session

from app.models.entities import Organization
from app.schemas.organization import OrganizationCreate, OrganizationUpdate, OrganizationNetworkSummary


class OrganizationService:
    @staticmethod
    def create(db: Session, payload: OrganizationCreate) -> Organization:
        org = Organization(id=uuid.uuid4(), **payload.model_dump())
        db.add(org)
        db.commit()
        db.refresh(org)
        return org

    @staticmethod
    def get_by_id(db: Session, org_id: uuid.UUID) -> Organization | None:
        return db.query(Organization).filter(Organization.id == org_id).first()

    @staticmethod
    def list_all(db: Session) -> list[Organization]:
        return db.query(Organization).order_by(Organization.name).all()

    @staticmethod
    def update(db: Session, org_id: uuid.UUID, payload: OrganizationUpdate) -> Organization | None:
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            return None
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(org, field, value)
        db.commit()
        db.refresh(org)
        return org

    @staticmethod
    def network_summary(db: Session, org_id: uuid.UUID) -> OrganizationNetworkSummary | None:
        from app.models.entities import Deal, Person

        org = db.query(Organization).filter(Organization.id == org_id).first()
        if not org:
            return None

        contact_count = db.query(Person).filter(Person.organization_id == org_id).count()
        deals = db.query(Deal).filter(Deal.organization_id == org_id).all()
        deal_count = len(deals)
        total_revenue = sum(d.actual_value for d in deals)
        active_deals = sum(1 for d in deals if d.status not in ("closed_won", "closed_lost", "dormant"))
        top_contacts = (
            db.query(Person)
            .filter(Person.organization_id == org_id)
            .order_by(Person.lifetime_value.desc())
            .limit(5)
            .all()
        )
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

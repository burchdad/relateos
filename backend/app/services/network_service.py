from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.entities import Deal, DealParticipant, Person, RelationshipEdge
from app.schemas.network import (
    NetworkEdge,
    NetworkGraphResponse,
    NetworkNode,
    ScoreboardResponse,
    TopPartnerEntry,
)

# Color groups per role
ROLE_COLOR_MAP = {
    "gp_partner": "capital",
    "lp_investor": "capital",
    "buyer": "buyer",
    "seller": "seller",
    "vendor": "vendor",
    "broker": "operator",
    "agent": "operator",
    "operator": "operator",
    "coach": "community",
    "student": "community",
    "community_member": "community",
    "podcast_guest": "community",
    "influencer": "community",
}


class NetworkService:
    @staticmethod
    def get_graph(
        db: Session,
        organization_id=None,
        contact_id=None,
        depth: int = 2,
        min_strength: float = 0.0,
        role: str | None = None,
        revenue_min: float = 0.0,
    ) -> NetworkGraphResponse:
        # Build node set
        people_q = db.query(Person)
        if organization_id:
            people_q = people_q.filter(Person.organization_id == organization_id)
        if role:
            people_q = people_q.filter(Person.primary_role == role)
        if revenue_min > 0:
            people_q = people_q.filter(Person.lifetime_value >= revenue_min)

        people = people_q.limit(200).all()

        # Count deals per person
        deal_counts: dict[str, int] = {}
        for person in people:
            count = (
                db.query(Deal)
                .filter(Deal.primary_contact_id == person.id)
                .count()
            )
            deal_counts[str(person.id)] = count

        nodes = [
            NetworkNode(
                id=str(p.id),
                label=f"{p.first_name} {p.last_name}",
                type="contact",
                role=p.primary_role,
                organization_id=str(p.organization_id) if p.organization_id else None,
                lifetime_value=p.lifetime_value,
                deal_count=deal_counts.get(str(p.id), 0),
                relationship_strength_score=p.relationship_strength_score,
                size=max(10.0, min(60.0, 10 + p.lifetime_value / 1000)),
                color_group=ROLE_COLOR_MAP.get(p.primary_role or "", "other"),
            )
            for p in people
        ]

        person_ids = {p.id for p in people}

        # Build edges from relationship_edges table
        edges_q = db.query(RelationshipEdge).filter(
            RelationshipEdge.source_contact_id.in_(person_ids),
            RelationshipEdge.target_contact_id.in_(person_ids),
        )
        if min_strength > 0:
            edges_q = edges_q.filter(RelationshipEdge.strength >= min_strength)

        db_edges = edges_q.limit(500).all()

        edges = [
            NetworkEdge(
                id=str(e.id),
                source=str(e.source_contact_id),
                target=str(e.target_contact_id),
                relationship_type=e.relationship_type,
                strength=e.strength,
                revenue_attributed=e.revenue_attributed,
                deal_count=e.deal_count,
            )
            for e in db_edges
        ]

        return NetworkGraphResponse(nodes=nodes, edges=edges)

    @staticmethod
    def get_scoreboard(db: Session) -> ScoreboardResponse:
        now = datetime.now(timezone.utc)
        t30 = now - timedelta(days=30)
        t90 = now - timedelta(days=90)

        all_deals = db.query(Deal).all()
        closed_deals = [d for d in all_deals if d.status == "closed_won"]

        total_revenue = sum(d.actual_value for d in closed_deals)
        t30_revenue = sum(d.actual_value for d in closed_deals if d.close_date and d.close_date.replace(tzinfo=timezone.utc) >= t30)
        t90_revenue = sum(d.actual_value for d in closed_deals if d.close_date and d.close_date.replace(tzinfo=timezone.utc) >= t90)

        deals_in_flight = sum(
            1 for d in all_deals if d.status not in ("closed_won", "closed_lost", "dormant", "idea")
        )

        # Referral fees pending
        referral_fees_pending = (
            db.query(func.sum(DealParticipant.referral_fee))
            .join(Deal)
            .filter(Deal.status.notin_(["closed_won", "closed_lost"]))
            .scalar()
            or 0.0
        )

        # Top referrers/partners: people associated with the most deal revenue
        partner_revenue: dict[str, dict] = {}
        for deal in closed_deals:
            for participant in deal.participants:
                if not participant.contact_id:
                    continue
                cid = str(participant.contact_id)
                if cid not in partner_revenue:
                    contact = db.query(Person).filter(Person.id == participant.contact_id).first()
                    partner_revenue[cid] = {
                        "contact_id": cid,
                        "name": f"{contact.first_name} {contact.last_name}" if contact else "Unknown",
                        "revenue": 0.0,
                        "deal_count": 0,
                        "referral_count": 0,
                    }
                partner_revenue[cid]["revenue"] += participant.split_amount
                partner_revenue[cid]["deal_count"] += 1
                if participant.role in ("referrer", "source"):
                    partner_revenue[cid]["referral_count"] += 1

        sorted_partners = sorted(partner_revenue.values(), key=lambda x: x["revenue"], reverse=True)

        top_partners = [
            TopPartnerEntry(
                contact_id=p["contact_id"],
                name=p["name"],
                revenue=p["revenue"],
                deal_count=p["deal_count"],
                referral_count=p["referral_count"],
            )
            for p in sorted_partners[:10]
        ]

        top_referrers = [
            TopPartnerEntry(
                contact_id=p["contact_id"],
                name=p["name"],
                revenue=p["revenue"],
                deal_count=p["deal_count"],
                referral_count=p["referral_count"],
            )
            for p in sorted(partner_revenue.values(), key=lambda x: x["referral_count"], reverse=True)[:10]
        ]

        # Most active contacts (by lifetime value)
        active_people = (
            db.query(Person)
            .order_by(Person.lifetime_value.desc())
            .limit(10)
            .all()
        )
        most_active = [
            {"id": str(p.id), "name": f"{p.first_name} {p.last_name}", "lifetime_value": p.lifetime_value}
            for p in active_people
        ]

        # Gamification leaderboard
        leaderboard = [
            {
                "rank": i + 1,
                "contact_id": p["contact_id"],
                "name": p["name"],
                "score": p["revenue"] + p["deal_count"] * 500 + p["referral_count"] * 1000,
                "revenue": p["revenue"],
                "deal_count": p["deal_count"],
                "referral_count": p["referral_count"],
            }
            for i, p in enumerate(sorted_partners[:20])
        ]

        return ScoreboardResponse(
            total_network_revenue=total_revenue,
            trailing_30_day_revenue=t30_revenue,
            trailing_90_day_revenue=t90_revenue,
            top_partners_by_revenue=top_partners,
            top_referrers=top_referrers,
            most_active_contacts=most_active,
            deals_in_flight=deals_in_flight,
            referral_fees_pending=referral_fees_pending,
            gamification_leaderboard=leaderboard,
        )

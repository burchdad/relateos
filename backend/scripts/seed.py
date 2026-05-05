import random
import uuid
from datetime import datetime, timedelta, timezone

from app.core.database import Base, SessionLocal, engine
from app.models import AIInsight, Interaction, Opportunity, Person, Relationship, RelationshipSignal, UserStyleProfile
from app.models.entities import (
    Organization,
    Deal,
    DealParticipant,
    RelationshipEdge,
    EngagementEvent,
    Meeting,
    MeetingAttendee,
    ContentAsset,
    FunnelCampaign,
)
from app.services.scoring_service import calculate_priority_score
from app.services.style_profile_service import DEFAULT_STYLE


FIRST_NAMES = ["Avery", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Parker", "Quinn", "Skyler", "Emerson", "Cameron", "Reese", "Blake", "Hayden", "Finley"]
LAST_NAMES = ["Parker", "Lee", "Nguyen", "Patel", "Garcia", "Kim", "Lopez", "Brown", "Turner", "Davis", "Shaw", "Brooks", "Diaz", "Miller", "Clark"]
TYPES = ["lead", "agent", "investor", "partner"]
STAGES = ["new", "engaged", "nurturing", "active", "dormant"]
INTERACTION_TYPES = ["call", "sms", "email", "meeting", "note"]
OWNER_IDS = ["owner-1", "owner-2", "owner-3"]


def _ensure_default_style_profiles(db, owner_ids: set[str]):
    for owner_user_id in owner_ids:
        existing = db.query(UserStyleProfile).filter(UserStyleProfile.owner_user_id == owner_user_id).first()
        if existing:
            continue
        db.add(
            UserStyleProfile(
                owner_user_id=owner_user_id,
                tone=DEFAULT_STYLE["tone"],
                length=DEFAULT_STYLE["length"],
                energy=DEFAULT_STYLE["energy"],
                emoji_usage=DEFAULT_STYLE["emoji_usage"],
            )
        )


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    db.query(RelationshipSignal).delete()
    db.query(AIInsight).delete()
    db.query(Interaction).delete()
    db.query(Opportunity).delete()
    db.query(Relationship).delete()
    db.query(Person).delete()
    db.query(UserStyleProfile).delete()
    db.commit()

    relationships = []
    owner_ids: set[str] = set()
    for i in range(15):
        first_name = FIRST_NAMES[i]
        last_name = LAST_NAMES[i]
        person = Person(
            first_name=first_name,
            last_name=last_name,
            email=f"{first_name.lower()}.{last_name.lower()}@example.com",
            phone=f"+1-555-010{i:02d}",
            tags={"segment": random.choice(["A", "B", "C"]), "region": random.choice(["west", "east", "south"])},
            metadata_json={"source": random.choice(["referral", "linkedin", "event"])},
        )
        db.add(person)
        db.flush()

        last_contacted = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 40))
        owner_user_id = random.choice(OWNER_IDS)
        owner_ids.add(owner_user_id)
        rel = Relationship(
            person_id=person.id,
            type=random.choice(TYPES),
            lifecycle_stage=random.choice(STAGES),
            relationship_strength=round(random.uniform(0.2, 0.95), 2),
            owner_user_id=owner_user_id,
            last_contacted_at=last_contacted,
        )
        db.add(rel)
        db.flush()
        relationships.append(rel)

        for _ in range(random.randint(2, 6)):
            days_ago = random.randint(1, 45)
            created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
            interaction = Interaction(
                relationship_id=rel.id,
                type=random.choice(INTERACTION_TYPES),
                content=random.choice(
                    [
                        "Discussed growth strategy and next milestone.",
                        "Quick touchpoint about timeline and blockers.",
                        "Shared market update and funding context.",
                        "Followed up on prior proposal and expectations.",
                    ]
                ),
                summary="Positive and open to follow-up.",
                sentiment=round(random.uniform(0.2, 0.95), 2),
                created_at=created_at,
            )
            db.add(interaction)

        for j in range(random.randint(0, 3)):
            opp = Opportunity(
                relationship_id=rel.id,
                title=f"Opportunity {j + 1}",
                value_estimate=random.choice([15000, 30000, 50000, 100000]),
                status=random.choice(["open", "active", "closed"]),
            )
            db.add(opp)

        db.add(
            AIInsight(
                relationship_id=rel.id,
                type="summary",
                content="Strategic relationship with clear upside. Timing favors a focused follow-up.",
                score=0.7,
            )
        )
        db.add(
            AIInsight(
                relationship_id=rel.id,
                type="suggestion",
                content="Wanted to reconnect on priorities this month. Open to a quick call Wednesday or Thursday?",
                score=0.8,
            )
        )

    db.commit()

    _ensure_default_style_profiles(db, owner_ids)
    db.commit()

    for rel in relationships:
        calculate_priority_score(db, rel.id)

    db.close()
    print(f"Seed complete: 15 relationships created across {len(owner_ids)} owners with default style profiles.")

    _seed_tr3_network()
    print("TR3 Network Intelligence demo data seeded.")


def _seed_tr3_network():
    """Seed TR3 Capital / Teifke Real Estate network intelligence demo data."""
    db = SessionLocal()
    try:
        # Cleanup new tables in dependency order
        for Model in [MeetingAttendee, Meeting, DealParticipant, Deal, RelationshipEdge, EngagementEvent, ContentAsset, FunnelCampaign]:
            db.query(Model).delete()
        # Remove people and orgs we're about to recreate (by email guard)
        demo_emails = [
            "matt@teifkerealestate.com", "partner.a@tr3capital.com", "partner.b@tr3capital.com",
            "investor.lp@example.com", "buyer.lead@example.com", "seller.lead@example.com",
            "vendor@example.com", "podcast.guest@example.com", "webinar.attend@example.com",
            "community@example.com",
        ]
        for email in demo_emails:
            existing = db.query(Person).filter(Person.email == email).first()
            if existing:
                db.delete(existing)
        db.query(Organization).filter(Organization.name.in_(["TR3 Capital", "Teifke Real Estate", "Partner Firm A", "Partner Firm B"])).delete(synchronize_session=False)
        db.commit()

        now = datetime.now(timezone.utc)

        # --- Organizations ---
        tr3_capital = Organization(
            id=uuid.uuid4(), name="TR3 Capital", org_type="fund",
            website="https://tr3capital.com", industry="real_estate_investment",
            description="TR3 Capital — multifamily syndication and fund operator.",
        )
        teifke_re = Organization(
            id=uuid.uuid4(), name="Teifke Real Estate", org_type="brokerage",
            website="https://teifkerealestate.com", industry="residential_real_estate",
            description="Teifke Real Estate — top Texas real estate team.",
        )
        partner_a = Organization(id=uuid.uuid4(), name="Partner Firm A", org_type="lp", industry="private_equity")
        partner_b = Organization(id=uuid.uuid4(), name="Partner Firm B", org_type="vendor", industry="mortgage")
        for org in [tr3_capital, teifke_re, partner_a, partner_b]:
            db.add(org)
        db.flush()

        # --- People ---
        def make_person(first, last, email, role, org_id, stage, ltv, referral_val, strength, source="direct"):
            p = Person(
                id=uuid.uuid4(), first_name=first, last_name=last, email=email,
                primary_role=role, organization_id=org_id, relationship_stage=stage,
                lifetime_value=ltv, referral_value=referral_val,
                relationship_strength_score=strength, source=source,
                last_engaged_at=now - timedelta(days=random.randint(1, 30)),
            )
            db.add(p)
            return p

        matt = make_person("Matt", "Teifke", "matt@teifkerealestate.com", "gp_partner", teifke_re.id, "champion", 2500000, 800000, 10.0)
        partner_a_contact = make_person("Alex", "Fontaine", "partner.a@tr3capital.com", "lp_investor", partner_a.id, "active", 500000, 200000, 8.5, "referral")
        partner_b_contact = make_person("Jordan", "Reyes", "partner.b@tr3capital.com", "gp_partner", partner_b.id, "active", 300000, 150000, 7.2, "referral")
        investor_lp = make_person("Dana", "Whitfield", "investor.lp@example.com", "lp_investor", None, "nurturing", 250000, 0, 5.5, "linkedin")
        buyer_lead = make_person("Chris", "Okafor", "buyer.lead@example.com", "buyer", None, "lead", 450000, 0, 3.0, "story_viewer")
        seller_lead = make_person("Sam", "Delgado", "seller.lead@example.com", "seller", None, "lead", 380000, 0, 2.5, "webinar")
        vendor_p = make_person("Robin", "Marsh", "vendor@example.com", "vendor", partner_b.id, "active", 80000, 40000, 6.0, "referral")
        podcast_guest = make_person("Taylor", "Burns", "podcast.guest@example.com", "community_member", None, "engaged", 0, 0, 4.0, "podcast")
        webinar_attend = make_person("Morgan", "Cho", "webinar.attend@example.com", "buyer", None, "lead", 0, 0, 2.0, "webinar")
        community_m = make_person("Casey", "Vidal", "community@example.com", "community_member", None, "new", 0, 0, 1.5, "instagram")
        db.flush()

        all_people = [matt, partner_a_contact, partner_b_contact, investor_lp, buyer_lead, seller_lead, vendor_p, podcast_guest, webinar_attend, community_m]

        # --- Deals ---
        def make_deal(title, deal_type, stage, value, probability, primary_id, source_id=None, referred_id=None, notes=""):
            d = Deal(
                id=uuid.uuid4(), title=title, deal_type=deal_type, stage=stage,
                value=value, probability=probability,
                primary_contact_id=primary_id,
                source_contact_id=source_id,
                referred_by_contact_id=referred_id,
                notes=notes, created_at=now - timedelta(days=random.randint(5, 60)),
            )
            db.add(d)
            return d

        deal1 = make_deal("TR3 Mastermind Coaching Package", "coaching", "closed_won", 25000, 1.0, matt.id, notes="Full coaching + accountability cohort Q1")
        deal2 = make_deal("4-Unit Buyer Referral — East Austin", "buyer_referral", "active", 450000, 0.75, buyer_lead.id, source_id=partner_a_contact.id, referred_id=partner_a_contact.id)
        deal3 = make_deal("Seller Lead — Manor TX", "seller_referral", "lead", 380000, 0.3, seller_lead.id)
        deal4 = make_deal("LP Partnership — Fund II", "partnership", "negotiating", 500000, 0.6, partner_a_contact.id)
        deal5 = make_deal("Vendor Referral — Mortgage", "vendor_referral", "closed_won", 12000, 1.0, vendor_p.id, referred_id=partner_b_contact.id)
        db.flush()

        # Deal participants
        for deal, person in [(deal1, matt), (deal2, buyer_lead), (deal2, partner_a_contact), (deal4, investor_lp)]:
            db.add(DealParticipant(id=uuid.uuid4(), deal_id=deal.id, person_id=person.id, role="contact"))

        # --- Relationship Edges ---
        edges = [
            (matt, partner_a_contact, "lp_relationship", 9.0),
            (matt, partner_b_contact, "business_partner", 7.5),
            (partner_a_contact, investor_lp, "referral_source", 6.0),
            (matt, vendor_p, "vendor", 5.0),
            (partner_a_contact, partner_b_contact, "co_investor", 4.5),
            (matt, podcast_guest, "brand_partner", 3.5),
            (partner_b_contact, buyer_lead, "buyer_agent", 3.0),
        ]
        for src, tgt, rel_type, strength in edges:
            db.add(RelationshipEdge(
                id=uuid.uuid4(), source_person_id=src.id, target_person_id=tgt.id,
                relationship_type=rel_type, strength=strength,
                deal_count=random.randint(0, 3),
                total_deal_value=random.choice([0, 50000, 100000, 250000]),
            ))

        # --- Engagement Events ---
        ev_types = [("story_view", "instagram"), ("webinar_attended", "zoom"), ("podcast_clip_view", "youtube"), ("email_open", "email"), ("dm", "instagram")]
        for person in all_people:
            for _ in range(random.randint(1, 4)):
                ev_type, platform = random.choice(ev_types)
                db.add(EngagementEvent(
                    id=uuid.uuid4(), person_id=person.id, event_type=ev_type,
                    source_platform=platform, engagement_score=round(random.uniform(0.5, 5.0), 2),
                    occurred_at=now - timedelta(days=random.randint(1, 60)),
                ))

        # --- Meetings ---
        m1 = Meeting(
            id=uuid.uuid4(), title="TR3 Capital Fund II LP Kickoff", platform="zoom",
            meeting_url="https://zoom.us/j/demo1", status="completed",
            scheduled_at=now - timedelta(days=14),
            summary="Covered fund structure, waterfall, and LP expectations. Strong interest from Fontaine and Whitfield.",
            transcript="[Host: Matt Teifke] Welcome everyone to the Fund II kickoff...",
        )
        m2 = Meeting(
            id=uuid.uuid4(), title="Weekly Agent Training — Teifke RE", platform="zoom",
            meeting_url="https://zoom.us/j/demo2", status="completed",
            scheduled_at=now - timedelta(days=7),
            summary="Covered objection handling and pipeline reviews. 42 attendees.",
        )
        db.add(m1)
        db.add(m2)
        db.flush()

        for person in [partner_a_contact, investor_lp, partner_b_contact]:
            db.add(MeetingAttendee(
                id=uuid.uuid4(), meeting_id=m1.id, person_id=person.id,
                name=f"{person.first_name} {person.last_name}", email=person.email,
                attendance_status="attended", followup_status="pending",
            ))
        for person in [buyer_lead, seller_lead, community_m, webinar_attend]:
            db.add(MeetingAttendee(
                id=uuid.uuid4(), meeting_id=m2.id, person_id=person.id,
                name=f"{person.first_name} {person.last_name}", email=person.email,
                attendance_status="attended", followup_status="pending",
            ))

        # --- Content Assets ---
        ca1 = ContentAsset(
            id=uuid.uuid4(), title="From Broker to Fund Manager — Matt Teifke EP. 47",
            content_type="podcast", source_url="https://youtube.com/watch?v=demo47",
            transcript="In this episode I break down exactly how I transitioned from a top producer at KW to running a multifamily fund...",
            summary="Matt shares the journey from brokerage to fund, key LP relationships, and content strategy.",
            status="published",
        )
        ca2 = ContentAsset(
            id=uuid.uuid4(), title="How to Find Off-Market Multifamily Deals",
            content_type="webinar", status="published",
            summary="Webinar replay covering deal sourcing strategies for 10-50 unit multifamily.",
        )
        db.add(ca1)
        db.add(ca2)
        db.flush()

        fc1 = FunnelCampaign(
            id=uuid.uuid4(), title="Fund II LP Nurture Sequence", campaign_type="lp_nurture",
            content_asset_id=ca1.id, status="active",
            description="5-email drip + IG story sequence for warm LP prospects from podcast listeners.",
        )
        db.add(fc1)

        db.commit()
        print("TR3 network seeded: orgs, contacts, deals, edges, events, meetings, content assets.")
    except Exception as e:
        db.rollback()
        print(f"TR3 seed error (non-fatal, tables may not exist yet): {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()



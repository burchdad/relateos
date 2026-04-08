import random
from datetime import datetime, timedelta, timezone

from app.core.database import Base, SessionLocal, engine
from app.models import AIInsight, Interaction, Opportunity, Person, Relationship
from app.services.scoring_service import calculate_priority_score


FIRST_NAMES = ["Avery", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Parker", "Quinn", "Skyler", "Emerson", "Cameron", "Reese", "Blake", "Hayden", "Finley"]
LAST_NAMES = ["Parker", "Lee", "Nguyen", "Patel", "Garcia", "Kim", "Lopez", "Brown", "Turner", "Davis", "Shaw", "Brooks", "Diaz", "Miller", "Clark"]
TYPES = ["lead", "agent", "investor", "partner"]
STAGES = ["new", "engaged", "nurturing", "active", "dormant"]
INTERACTION_TYPES = ["call", "sms", "email", "meeting", "note"]


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    db.query(AIInsight).delete()
    db.query(Interaction).delete()
    db.query(Opportunity).delete()
    db.query(Relationship).delete()
    db.query(Person).delete()
    db.commit()

    relationships = []
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
        rel = Relationship(
            person_id=person.id,
            type=random.choice(TYPES),
            lifecycle_stage=random.choice(STAGES),
            relationship_strength=round(random.uniform(0.2, 0.95), 2),
            owner_user_id="owner-1",
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

    for rel in relationships:
        calculate_priority_score(db, rel.id)

    db.close()
    print("Seed complete: 15 relationships created.")


if __name__ == "__main__":
    seed()

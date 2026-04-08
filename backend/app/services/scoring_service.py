from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Interaction, Opportunity, Relationship


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def calculate_priority_score(db: Session, relationship_id):
    rel = db.query(Relationship).filter(Relationship.id == relationship_id).first()
    if not rel:
        return None

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=7)
    recent_interactions = (
        db.query(func.count(Interaction.id))
        .filter(Interaction.relationship_id == rel.id, Interaction.created_at >= window_start)
        .scalar()
        or 0
    )

    active_opps = (
        db.query(Opportunity)
        .filter(Opportunity.relationship_id == rel.id, Opportunity.status.in_(["open", "active"]))
        .all()
    )
    all_opps = db.query(Opportunity).filter(Opportunity.relationship_id == rel.id).all()

    total_value = sum(o.value_estimate or 0 for o in active_opps)
    opp_count = len(active_opps)

    opportunity_component = _clamp((recent_interactions / 5.0) + (opp_count / 3.0))

    days_since_contact = 30.0
    last_contact = None
    if rel.last_contacted_at:
        last_contact = rel.last_contacted_at
        if last_contact.tzinfo is None:
            last_contact = last_contact.replace(tzinfo=timezone.utc)
        else:
            last_contact = last_contact.astimezone(timezone.utc)
        delta = now - last_contact
        days_since_contact = max(0.0, delta.total_seconds() / 86400.0)
    risk_component = _clamp(days_since_contact / 30.0)

    value_component = _clamp((opp_count / 4.0) + (total_value / 100000.0))

    recency_component = _clamp(1.0 - (days_since_contact / 60.0))

    score = (
        (opportunity_component * 0.35)
        + (risk_component * 0.25)
        + (value_component * 0.25)
        + (recency_component * 0.15)
    )

    # v1.5 signal refinements for explainable ranking.
    recent_48h = now - timedelta(hours=48)
    interactions_48h = (
        db.query(func.count(Interaction.id))
        .filter(Interaction.relationship_id == rel.id, Interaction.created_at >= recent_48h)
        .scalar()
        or 0
    )
    if interactions_48h > 0:
        score += 0.10

    if opp_count > 0:
        score += 0.10

    recent_scored_interactions = (
        db.query(Interaction)
        .filter(Interaction.relationship_id == rel.id, Interaction.sentiment.isnot(None))
        .order_by(Interaction.created_at.desc())
        .limit(3)
        .all()
    )
    if recent_scored_interactions:
        avg_sentiment = sum(float(i.sentiment or 0.0) for i in recent_scored_interactions) / len(recent_scored_interactions)
        if avg_sentiment >= 0.65:
            score += 0.08

    if 14.0 <= days_since_contact <= 30.0:
        score += 0.10

    if rel.next_suggested_action_at:
        due_at = rel.next_suggested_action_at
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        else:
            due_at = due_at.astimezone(timezone.utc)
        if due_at < now and (rel.last_contacted_at is None or due_at > last_contact):
            score += 0.10

    total_opp_value = sum(float(o.value_estimate or 0.0) for o in all_opps)
    if total_opp_value > 0:
        score += 0.07
    if len(all_opps) >= 2:
        score += 0.07

    score = _clamp(score)
    score = round(score * 100, 2)

    rel.priority_score = score
    db.commit()
    db.refresh(rel)
    return rel.priority_score

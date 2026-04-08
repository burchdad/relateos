from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.models import AIInsight, Interaction, Opportunity, Relationship


def _latest_insight_content(db: Session, relationship_id, insight_type: str):
    item = (
        db.query(AIInsight)
        .filter(AIInsight.relationship_id == relationship_id, AIInsight.type == insight_type)
        .order_by(AIInsight.created_at.desc())
        .first()
    )
    return item.content if item else None


def _normalize_contact_date(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _dashboard_signals(db: Session, relationship: Relationship):
    now = datetime.now(timezone.utc)
    last_contact = _normalize_contact_date(relationship.last_contacted_at)
    days_since = None
    if last_contact:
        days_since = max(0.0, (now - last_contact).total_seconds() / 86400.0)

    interactions_48h = (
        db.query(func.count(Interaction.id))
        .filter(Interaction.relationship_id == relationship.id, Interaction.created_at >= now - timedelta(hours=48))
        .scalar()
        or 0
    )
    open_opps = (
        db.query(Opportunity)
        .filter(Opportunity.relationship_id == relationship.id, Opportunity.status.in_(["open", "active"]))
        .all()
    )

    if interactions_48h > 0:
        return (
            "Recent reply",
            "High Priority",
            "They engaged recently and momentum is high. Follow up while context is fresh.",
        )

    if open_opps:
        return (
            "Active deal",
            "Opportunity",
            "There is active opportunity value on the table. Timely outreach can advance outcomes.",
        )

    if days_since is not None and days_since >= 21:
        return (
            f"No contact {int(days_since)} days",
            "At Risk",
            "The relationship is drifting due to contact gap. Reach out now to reduce churn risk.",
        )

    if relationship.priority_score >= 75:
        return (
            "High score",
            "High Priority",
            "Multiple strong signals make this one of the highest expected-value conversations today.",
        )

    return (
        "Keep warm",
        "Opportunity",
        "A short touchpoint now keeps momentum healthy and prevents future drop-off.",
    )


def get_top_priorities(db: Session, limit: int = 10):
    rows = (
        db.query(Relationship)
        .options(joinedload(Relationship.person))
        .order_by(desc(Relationship.priority_score))
        .limit(limit)
        .all()
    )

    output = []
    for rel in rows:
        summary = _latest_insight_content(db, rel.id, "summary")
        suggestion = _latest_insight_content(db, rel.id, "suggestion")
        reason_tag, confidence_indicator, why_now = _dashboard_signals(db, rel)
        output.append(
            {
                "relationship_id": rel.id,
                "name": f"{rel.person.first_name} {rel.person.last_name}",
                "priority_score": rel.priority_score,
                "last_contacted_at": rel.last_contacted_at,
                "summary": summary,
                "suggested_message": suggestion,
                "why_now": why_now,
                "confidence_indicator": confidence_indicator,
                "reason_tag": reason_tag,
            }
        )
    return output

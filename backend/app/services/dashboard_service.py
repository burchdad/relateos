from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.models import AIInsight, Relationship, RelationshipSignal


def _latest_insight_content(db: Session, relationship_id, insight_type: str):
    item = (
        db.query(AIInsight)
        .filter(AIInsight.relationship_id == relationship_id, AIInsight.type == insight_type)
        .order_by(AIInsight.created_at.desc())
        .first()
    )
    return item.content if item else None


SIGNAL_LABELS = {
    "RECENT_REPLY": "Recent reply",
    "NO_CONTACT_21_DAYS": "No contact 21+ days",
    "ACTIVE_DEAL": "Active deal",
    "HIGH_VALUE_CONTACT": "High value contact",
    "NEGATIVE_SENTIMENT": "Negative sentiment",
    "POSITIVE_SENTIMENT": "Positive sentiment",
    "FOLLOW_UP_DUE": "Follow-up due",
}


def _load_signals(db: Session, relationship_id):
    return (
        db.query(RelationshipSignal)
        .filter(RelationshipSignal.relationship_id == relationship_id)
        .order_by(RelationshipSignal.weight.desc())
        .all()
    )


def _urgency(relationship: Relationship, signals: list[RelationshipSignal]) -> str:
    signal_keys = {s.signal_key for s in signals}
    if relationship.priority_score >= 80 or "FOLLOW_UP_DUE" in signal_keys:
        return "Act Today"
    if relationship.priority_score >= 60 or "ACTIVE_DEAL" in signal_keys or "NO_CONTACT_21_DAYS" in signal_keys:
        return "This Week"
    return "Low Priority"


def _dashboard_signals(signals: list[RelationshipSignal]):
    if signals:
        primary = signals[0]
        reason_tag = SIGNAL_LABELS.get(primary.signal_key, primary.signal_key.replace("_", " ").title())
        confidence_indicator = "At Risk" if primary.signal_key in {"NEGATIVE_SENTIMENT", "NO_CONTACT_21_DAYS"} else "High Priority"
        why_now = primary.reason
        signal_reasons = [s.reason for s in signals[:3]]
        return reason_tag, confidence_indicator, why_now, signal_reasons

    return (
        "Keep warm",
        "Opportunity",
        "A short touchpoint now keeps momentum healthy and prevents future drop-off.",
        ["No dominant signal detected yet."],
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
        signals = _load_signals(db, rel.id)
        reason_tag, confidence_indicator, why_now, signal_reasons = _dashboard_signals(signals)
        urgency_level = _urgency(rel, signals)
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
                "urgency_level": urgency_level,
                "signal_reasons": signal_reasons,
            }
        )
    return output


def get_score_explanation(db: Session, relationship_id):
    rel = (
        db.query(Relationship)
        .options(joinedload(Relationship.person))
        .filter(Relationship.id == relationship_id)
        .first()
    )
    if not rel:
        return None

    signals = _load_signals(db, relationship_id)
    urgency_level = _urgency(rel, signals)

    contributions = []
    total_signal_impact = 0.0
    for signal in signals:
        impact = round(float(signal.weight) * float(signal.magnitude), 2)
        total_signal_impact += impact
        contributions.append(
            {
                "signal_key": signal.signal_key,
                "label": SIGNAL_LABELS.get(signal.signal_key, signal.signal_key.replace("_", " ").title()),
                "reason": signal.reason,
                "weight": float(signal.weight),
                "magnitude": float(signal.magnitude),
                "impact": impact,
            }
        )

    base_score = round(float(rel.priority_score or 0.0) - total_signal_impact, 2)

    return {
        "relationship_id": rel.id,
        "name": f"{rel.person.first_name} {rel.person.last_name}",
        "priority_score": float(rel.priority_score or 0.0),
        "base_score": base_score,
        "total_signal_impact": round(total_signal_impact, 2),
        "urgency_level": urgency_level,
        "contributions": contributions,
    }

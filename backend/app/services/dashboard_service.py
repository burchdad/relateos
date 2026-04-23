from datetime import datetime, timezone

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
    "CONTENT_SHARED_RECENTLY": "Content shared recently",
    "CONTENT_ENGAGED_RECENTLY": "Content engaged recently",
    "CONTENT_IGNORED_RECENTLY": "Content ignored recently",
}


def _load_signals(db: Session, relationship_id):
    return (
        db.query(RelationshipSignal)
        .filter(RelationshipSignal.relationship_id == relationship_id)
        .order_by(RelationshipSignal.weight.desc())
        .all()
    )


def _days_since_last_contact(relationship: Relationship) -> int | None:
    if not relationship.last_contacted_at:
        return None
    now = datetime.now(timezone.utc)
    then = relationship.last_contacted_at
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    return max(0, int((now - then.astimezone(timezone.utc)).total_seconds() // 86400))


def _fallback_summary(relationship: Relationship) -> str:
    metadata = relationship.person.metadata_json if relationship.person else {}
    interests = metadata.get("interests") or "their current priorities"
    status = (metadata.get("current_status") or relationship.lifecycle_stage or "active").replace("_", " ")
    return f"{relationship.person.first_name} is a {relationship.type} contact focused on {interests}. Current status: {status}."


def _fallback_suggestion(relationship: Relationship) -> str:
    metadata = relationship.person.metadata_json if relationship.person else {}
    interests = metadata.get("interests") or "their goals"
    status_key = (metadata.get("current_status") or relationship.lifecycle_stage or "active").strip().lower()
    days_since = _days_since_last_contact(relationship)
    relationship_type = (relationship.type or "").lower()
    first_name = relationship.person.first_name if relationship.person else "there"

    if days_since is None or days_since >= 14:
        if relationship_type == "investor":
            if status_key == "hot":
                return f"Hey {first_name}, quick pulse check: still ready to move fast on {interests}? I can send top-fit options today."
            if status_key == "cold":
                return f"Hey {first_name}, checking if {interests} is still on your radar, or if your buy box changed recently."
            return f"Hey {first_name}, are you still focused on {interests}, or has your buy box shifted recently?"
        if relationship_type == "lead":
            if status_key == "hot":
                return f"Hey {first_name}, momentum looks strong on {interests}. Want to lock a quick next-step call this week?"
            if status_key == "cold":
                return f"Hey {first_name}, light check-in on {interests}. Is this still a priority right now?"
            return f"Hey {first_name}, checking in on {interests}. Still a priority, and want to map the next step?"
        if relationship_type == "agent":
            if status_key == "hot":
                return f"Hey {first_name}, active demand is building around {interests}. Any strong matches you can share this week?"
            if status_key == "cold":
                return f"Hey {first_name}, touching base on {interests}. Anything new worth watching?"
            return f"Hey {first_name}, quick sync on {interests}. Any active opportunities I should review this week?"
        return f"Hey {first_name}, quick check-in. Are you still focused on {interests}, or has anything shifted?"

    if relationship_type == "investor":
        if status_key == "hot":
            return f"Hey {first_name}, keeping this moving on {interests}. Want 2 strong-fit opportunities in your inbox today?"
        if status_key == "cold":
            return f"Hey {first_name}, keeping a light touch on {interests}. Still worth sharing opportunities this month?"
        return f"Hey {first_name}, keeping momentum on {interests}. Want me to send over 1-2 aligned opportunities?"
    if relationship_type == "lead":
        if status_key == "hot":
            return f"Hey {first_name}, momentum is strong on {interests}. Open for a short decision call this week?"
        if status_key == "cold":
            return f"Hey {first_name}, quick pulse check on {interests}. Should we pause or pick one simple next step?"
        return f"Hey {first_name}, keeping momentum on {interests}. Open to a short next-step call this week?"
    if relationship_type == "agent":
        if status_key == "hot":
            return f"Hey {first_name}, strong demand is active around {interests}. Can you send your best near-term matches?"
        if status_key == "cold":
            return f"Hey {first_name}, keeping this warm around {interests}. Any listings worth a quick look this week?"
        return f"Hey {first_name}, staying synced on {interests}. Do you have fresh inventory that fits this focus?"
    return f"Hey {first_name}, wanted to keep momentum on {interests}. Open to a quick sync this week?"


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
        ["Context is loaded; sending a short touchpoint now protects momentum."],
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
        summary = _latest_insight_content(db, rel.id, "summary") or _fallback_summary(rel)
        suggestion = _latest_insight_content(db, rel.id, "suggestion") or _fallback_suggestion(rel)
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

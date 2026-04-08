from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Interaction, Opportunity, Relationship, RelationshipSignal


SIGNAL_WEIGHTS = {
    "RECENT_REPLY": 12.0,
    "NO_CONTACT_21_DAYS": 14.0,
    "ACTIVE_DEAL": 16.0,
    "HIGH_VALUE_CONTACT": 10.0,
    "NEGATIVE_SENTIMENT": 11.0,
    "POSITIVE_SENTIMENT": -5.0,
    "FOLLOW_UP_DUE": 12.0,
}


def _to_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def derive_relationship_signals(db: Session, relationship: Relationship) -> list[dict]:
    now = datetime.now(timezone.utc)
    signals: list[dict] = []

    interactions_48h = (
        db.query(func.count(Interaction.id))
        .filter(Interaction.relationship_id == relationship.id, Interaction.created_at >= now - timedelta(hours=48))
        .scalar()
        or 0
    )
    if interactions_48h > 0:
        signals.append(
            {
                "signal_key": "RECENT_REPLY",
                "magnitude": min(2.0, float(interactions_48h) / 2.0),
                "reason": "Contact engaged in the last 48 hours.",
            }
        )

    open_opps = (
        db.query(Opportunity)
        .filter(Opportunity.relationship_id == relationship.id, Opportunity.status.in_(["open", "active"]))
        .all()
    )
    if open_opps:
        signals.append(
            {
                "signal_key": "ACTIVE_DEAL",
                "magnitude": min(2.0, float(len(open_opps)) / 2.0),
                "reason": "There is at least one active opportunity.",
            }
        )

    total_opp_value = sum(float(o.value_estimate or 0.0) for o in open_opps)
    if total_opp_value >= 100000:
        signals.append(
            {
                "signal_key": "HIGH_VALUE_CONTACT",
                "magnitude": min(2.0, total_opp_value / 250000.0),
                "reason": f"Open opportunity value is ${int(total_opp_value):,}.",
            }
        )

    last_contact = _to_utc(relationship.last_contacted_at)
    if last_contact:
        days_since = max(0.0, (now - last_contact).total_seconds() / 86400.0)
        if days_since >= 21.0:
            signals.append(
                {
                    "signal_key": "NO_CONTACT_21_DAYS",
                    "magnitude": min(2.0, days_since / 21.0),
                    "reason": f"No contact for {int(days_since)} days.",
                }
            )
    else:
        signals.append(
            {
                "signal_key": "NO_CONTACT_21_DAYS",
                "magnitude": 1.0,
                "reason": "No recent outreach logged yet; schedule a first touchpoint.",
            }
        )

    recent_scored_interactions = (
        db.query(Interaction)
        .filter(Interaction.relationship_id == relationship.id, Interaction.sentiment.isnot(None))
        .order_by(Interaction.created_at.desc())
        .limit(3)
        .all()
    )
    if recent_scored_interactions:
        avg_sentiment = sum(float(i.sentiment or 0.0) for i in recent_scored_interactions) / len(recent_scored_interactions)
        if avg_sentiment <= 0.35:
            signals.append(
                {
                    "signal_key": "NEGATIVE_SENTIMENT",
                    "magnitude": min(2.0, (0.36 - avg_sentiment) * 3.0),
                    "reason": "Recent sentiment trend is negative.",
                }
            )
        elif avg_sentiment >= 0.70:
            signals.append(
                {
                    "signal_key": "POSITIVE_SENTIMENT",
                    "magnitude": min(2.0, (avg_sentiment - 0.69) * 3.0),
                    "reason": "Recent sentiment trend is positive.",
                }
            )

    due_at = _to_utc(relationship.next_suggested_action_at)
    if due_at and due_at <= now:
        signals.append(
            {
                "signal_key": "FOLLOW_UP_DUE",
                "magnitude": min(2.0, max(1.0, (now - due_at).total_seconds() / 86400.0 / 7.0)),
                "reason": "Suggested follow-up date is due.",
            }
        )

    for signal in signals:
        signal["weight"] = SIGNAL_WEIGHTS[signal["signal_key"]]

    return signals


def persist_relationship_signals(db: Session, relationship_id, signals: list[dict]) -> None:
    db.query(RelationshipSignal).filter(RelationshipSignal.relationship_id == relationship_id).delete()
    for signal in signals:
        db.add(
            RelationshipSignal(
                relationship_id=relationship_id,
                signal_key=signal["signal_key"],
                weight=float(signal["weight"]),
                magnitude=float(signal["magnitude"]),
                reason=signal["reason"],
            )
        )


def score_from_signals(signals: list[dict]) -> float:
    score = 50.0
    for signal in signals:
        score += float(signal["weight"]) * float(signal["magnitude"])
    return max(0.0, min(100.0, round(score, 2)))

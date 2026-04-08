from sqlalchemy.orm import Session

from app.models import Relationship
from app.services.signal_service import derive_relationship_signals, persist_relationship_signals, score_from_signals


def calculate_priority_score(db: Session, relationship_id):
    rel = db.query(Relationship).filter(Relationship.id == relationship_id).first()
    if not rel:
        return None

    signals = derive_relationship_signals(db, rel)
    persist_relationship_signals(db, rel.id, signals)
    score = score_from_signals(signals)

    rel.priority_score = score
    db.commit()
    db.refresh(rel)
    return rel.priority_score

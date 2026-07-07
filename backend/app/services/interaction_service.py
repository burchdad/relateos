from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Interaction, Relationship
from app.schemas.interaction import InteractionCreate


class InteractionService:
    @staticmethod
    def log_interaction(db: Session, payload: InteractionCreate, workspace_id=None) -> Interaction:
        relationship_query = db.query(Relationship).filter(Relationship.id == payload.relationship_id)
        if workspace_id:
            relationship_query = relationship_query.filter(Relationship.workspace_id == workspace_id)
        rel = relationship_query.first()
        if not rel:
            raise ValueError("Relationship not found")

        interaction = Interaction(
            relationship_id=payload.relationship_id,
            type=payload.type,
            content=payload.content,
            summary=payload.summary,
            sentiment=payload.sentiment,
        )
        db.add(interaction)

        rel.last_contacted_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(interaction)
        return interaction

    @staticmethod
    def get_timeline(db: Session, relationship_id, workspace_id=None):
        relationship_query = db.query(Relationship).filter(Relationship.id == relationship_id)
        if workspace_id:
            relationship_query = relationship_query.filter(Relationship.workspace_id == workspace_id)
        if not relationship_query.first():
            return None

        return db.query(Interaction).filter(Interaction.relationship_id == relationship_id).order_by(Interaction.created_at.desc()).all()

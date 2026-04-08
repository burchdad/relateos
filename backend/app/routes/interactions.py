from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.interaction import InteractionCreate, InteractionOut
from app.services.interaction_service import InteractionService
from app.services.scoring_service import calculate_priority_score
from app.workers.tasks import generate_insights_task, generate_summary_after_interaction


router = APIRouter(tags=["interactions"])


@router.post("/interactions", response_model=InteractionOut)
def create_interaction(payload: InteractionCreate, db: Session = Depends(get_db)):
    interaction = InteractionService.log_interaction(db, payload)
    calculate_priority_score(db, payload.relationship_id)

    generate_summary_after_interaction.delay(str(payload.relationship_id))
    generate_insights_task.delay(str(payload.relationship_id))

    return interaction


@router.get("/relationships/{relationship_id}/interactions", response_model=list[InteractionOut])
def get_timeline(relationship_id: UUID, db: Session = Depends(get_db)):
    return InteractionService.get_timeline(db, relationship_id)

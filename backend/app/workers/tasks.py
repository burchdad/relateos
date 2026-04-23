from app.core.database import SessionLocal
from app.models import Relationship
from app.services.ai_service import AIService
from app.services.followup_service import FollowUpSuggestionService
from app.services.scoring_service import calculate_priority_score
from app.workers.celery_app import celery
from uuid import UUID


@celery.task(name="app.workers.tasks.generate_summary_after_interaction")
def generate_summary_after_interaction(relationship_id: str):
    db = SessionLocal()
    try:
        AIService().generate_contact_summary(db, relationship_id)
    finally:
        db.close()


@celery.task(name="app.workers.tasks.generate_insights_task")
def generate_insights_task(relationship_id: str):
    db = SessionLocal()
    try:
        AIService().generate_insights(db, relationship_id)
    finally:
        db.close()


@celery.task(name="app.workers.tasks.recalculate_scores")
def recalculate_scores():
    db = SessionLocal()
    try:
        ids = [str(r.id) for r in db.query(Relationship.id).all()]
        for rid in ids:
            calculate_priority_score(db, rid)
        return {"updated": len(ids)}
    finally:
        db.close()


@celery.task(name="app.workers.tasks.dispatch_content_followup_task")
def dispatch_content_followup_task(content_id: str, day_offset: int, relationship_id: str):
    db = SessionLocal()
    try:
        dispatched = FollowUpSuggestionService.dispatch_followup_for_relationship(
            db,
            content_id=UUID(content_id),
            day_offset=day_offset,
            relationship_id=UUID(relationship_id),
        )
        return {"dispatched": bool(dispatched)}
    finally:
        db.close()

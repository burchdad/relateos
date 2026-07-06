import logging
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_db
from app.core.workspace import workspace_id_for_user
from app.models import AppUser
from app.schemas.relationship import (
    RelationshipBulkDeleteRequest,
    RelationshipBulkDeleteResult,
    RelationshipCreate,
    RelationshipOut,
    RelationshipUpdateStage,
)
from app.services.ai_service import AIService
from app.services.relationship_service import RelationshipService
from app.services.scoring_service import calculate_priority_score


router = APIRouter(prefix="/relationships", tags=["relationships"])
logger = logging.getLogger(__name__)


@router.post("", response_model=RelationshipOut, status_code=201)
def create_relationship(payload: RelationshipCreate, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    workspace_id = workspace_id_for_user(db, user)
    rel = None
    try:
        rel = RelationshipService.create_person_and_relationship(db, payload, workspace_id=workspace_id)
        try:
            calculate_priority_score(db, rel.id)
        except Exception as exc:
            db.rollback()
            logger.warning("Score calculation failed for relationship %s: %s", rel.id, exc, exc_info=True)

        ai_service = AIService()
        try:
            ai_service.generate_contact_summary(db, rel.id)
            ai_service.generate_message_suggestion(
                db,
                rel.id,
                goal=f"check in on their interest in {payload.interests}",
            )
        except Exception as exc:
            db.rollback()
            logger.warning("AI bootstrap generation failed for relationship %s: %s", rel.id, exc, exc_info=True)

        hydrated = RelationshipService.get_by_id(db, rel.id, workspace_id=workspace_id)
        if hydrated:
            return hydrated
        raise RuntimeError(f"Failed to load relationship {rel.id} after creation")
    except Exception as exc:
        logger.error("Create relationship request failed: %s", exc, exc_info=True)
        db.rollback()
        if rel is not None:
            fallback = RelationshipService.get_by_id(db, rel.id, workspace_id=workspace_id)
            if fallback:
                logger.warning("Recovered create response for persisted relationship %s", rel.id)
                return fallback
        raise


@router.get("", response_model=list[RelationshipOut])
def list_relationships(db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    return RelationshipService.list_all(db, workspace_id=workspace_id_for_user(db, user))


@router.get("/{relationship_id}", response_model=RelationshipOut)
def get_relationship(relationship_id: UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    rel = RelationshipService.get_by_id(db, relationship_id, workspace_id=workspace_id_for_user(db, user))
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return rel


@router.patch("/{relationship_id}/stage", response_model=RelationshipOut)
def update_stage(relationship_id: UUID, payload: RelationshipUpdateStage, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    workspace_id = workspace_id_for_user(db, user)
    rel = RelationshipService.update_lifecycle_stage(db, relationship_id, payload.lifecycle_stage, workspace_id=workspace_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return RelationshipService.get_by_id(db, relationship_id, workspace_id=workspace_id)


@router.delete("/{relationship_id}")
def delete_relationship(relationship_id: UUID, db: Session = Depends(get_db), user: AppUser = Depends(current_user)):
    deleted = RelationshipService.delete_relationship(db, relationship_id, workspace_id=workspace_id_for_user(db, user))
    if not deleted:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return {"deleted_count": 1}


@router.delete("", response_model=RelationshipBulkDeleteResult)
def bulk_delete_relationships(
    payload: RelationshipBulkDeleteRequest = Body(...),
    db: Session = Depends(get_db),
    user: AppUser = Depends(current_user),
):
    deleted_count = RelationshipService.bulk_delete_relationships(
        db,
        relationship_ids=payload.relationship_ids,
        delete_all=payload.delete_all,
        workspace_id=workspace_id_for_user(db, user),
    )
    return RelationshipBulkDeleteResult(deleted_count=deleted_count)

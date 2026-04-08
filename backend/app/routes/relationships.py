from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.relationship import RelationshipCreate, RelationshipOut, RelationshipUpdateStage
from app.services.relationship_service import RelationshipService
from app.services.scoring_service import calculate_priority_score


router = APIRouter(prefix="/relationships", tags=["relationships"])


@router.post("", response_model=RelationshipOut)
def create_relationship(payload: RelationshipCreate, db: Session = Depends(get_db)):
    rel = RelationshipService.create_person_and_relationship(db, payload)
    calculate_priority_score(db, rel.id)
    rel = RelationshipService.get_by_id(db, rel.id)
    return rel


@router.get("", response_model=list[RelationshipOut])
def list_relationships(db: Session = Depends(get_db)):
    return RelationshipService.list_all(db)


@router.get("/{relationship_id}", response_model=RelationshipOut)
def get_relationship(relationship_id: UUID, db: Session = Depends(get_db)):
    rel = RelationshipService.get_by_id(db, relationship_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return rel


@router.patch("/{relationship_id}/stage", response_model=RelationshipOut)
def update_stage(relationship_id: UUID, payload: RelationshipUpdateStage, db: Session = Depends(get_db)):
    rel = RelationshipService.update_lifecycle_stage(db, relationship_id, payload.lifecycle_stage)
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return RelationshipService.get_by_id(db, relationship_id)

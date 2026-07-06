import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import AppUser, Workspace


def workspace_id_for_user(db: Session, user: AppUser) -> uuid.UUID:
    db_user = db.query(AppUser).filter(AppUser.id == user.id).first()
    if not db_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not db_user.workspace_id:
        workspace = Workspace(
            id=uuid.uuid4(),
            name=db_user.company_name or f"{db_user.name}'s Workspace",
            owner_user_id=db_user.id,
        )
        db.add(workspace)
        db.flush()
        db_user.workspace_id = workspace.id
        db.commit()
        db.refresh(db_user)
    return db_user.workspace_id

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.style import StyleProfileRequest, StyleProfileResponse
from app.services.style_profile_service import get_style_profile, upsert_style_profile


router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("/style/{owner_user_id}", response_model=StyleProfileResponse)
def get_user_style(owner_user_id: str, db: Session = Depends(get_db)):
    style = get_style_profile(db, owner_user_id)
    return StyleProfileResponse(owner_user_id=owner_user_id, **style)


@router.put("/style/{owner_user_id}", response_model=StyleProfileResponse)
def put_user_style(owner_user_id: str, payload: StyleProfileRequest, db: Session = Depends(get_db)):
    item = upsert_style_profile(db, owner_user_id, payload)
    return StyleProfileResponse(
        owner_user_id=item.owner_user_id,
        tone=item.tone,
        length=item.length,
        energy=item.energy,
        emoji_usage=item.emoji_usage,
    )

from sqlalchemy.orm import Session

from app.models import UserStyleProfile
from app.schemas.style import StyleProfileRequest


DEFAULT_STYLE = {
    "tone": "casual",
    "length": "short",
    "energy": "medium",
    "emoji_usage": "low",
}


def get_style_profile(db: Session, owner_user_id: str | None) -> dict:
    if not owner_user_id:
        return DEFAULT_STYLE.copy()

    profile = db.query(UserStyleProfile).filter(UserStyleProfile.owner_user_id == owner_user_id).first()
    if not profile:
        return DEFAULT_STYLE.copy()

    return {
        "tone": profile.tone,
        "length": profile.length,
        "energy": profile.energy,
        "emoji_usage": profile.emoji_usage,
    }


def upsert_style_profile(db: Session, owner_user_id: str, payload: StyleProfileRequest) -> UserStyleProfile:
    profile = db.query(UserStyleProfile).filter(UserStyleProfile.owner_user_id == owner_user_id).first()
    if not profile:
        profile = UserStyleProfile(owner_user_id=owner_user_id)
        db.add(profile)

    profile.tone = payload.tone
    profile.length = payload.length
    profile.energy = payload.energy
    profile.emoji_usage = payload.emoji_usage

    db.commit()
    db.refresh(profile)
    return profile

from sqlalchemy.orm import Session

from app.services.system_settings_service import get_setting, upsert_setting

SIGNAL_WEIGHT_PRESETS: dict[str, dict[str, float]] = {
    "balanced": {
        "RECENT_REPLY": 12.0,
        "NO_CONTACT_21_DAYS": 14.0,
        "ACTIVE_DEAL": 16.0,
        "HIGH_VALUE_CONTACT": 10.0,
        "NEGATIVE_SENTIMENT": 11.0,
        "POSITIVE_SENTIMENT": -5.0,
        "FOLLOW_UP_DUE": 12.0,
        "CONTENT_SHARED_RECENTLY": -3.0,
        "CONTENT_ENGAGED_RECENTLY": 9.0,
        "CONTENT_IGNORED_RECENTLY": 4.0,
    },
    "aggressive_followup": {
        "RECENT_REPLY": 10.0,
        "NO_CONTACT_21_DAYS": 18.0,
        "ACTIVE_DEAL": 17.0,
        "HIGH_VALUE_CONTACT": 8.0,
        "NEGATIVE_SENTIMENT": 12.0,
        "POSITIVE_SENTIMENT": -4.0,
        "FOLLOW_UP_DUE": 16.0,
        "CONTENT_SHARED_RECENTLY": -2.0,
        "CONTENT_ENGAGED_RECENTLY": 8.0,
        "CONTENT_IGNORED_RECENTLY": 6.0,
    },
    "relationship_nurture": {
        "RECENT_REPLY": 15.0,
        "NO_CONTACT_21_DAYS": 10.0,
        "ACTIVE_DEAL": 14.0,
        "HIGH_VALUE_CONTACT": 9.0,
        "NEGATIVE_SENTIMENT": 9.0,
        "POSITIVE_SENTIMENT": -8.0,
        "FOLLOW_UP_DUE": 10.0,
        "CONTENT_SHARED_RECENTLY": -4.0,
        "CONTENT_ENGAGED_RECENTLY": 12.0,
        "CONTENT_IGNORED_RECENTLY": 3.0,
    },
}


def get_active_signal_preset(db: Session) -> dict:
    payload = get_setting(db, "signal_weight_preset", default={"preset_name": "balanced"})
    preset_name = payload.get("preset_name", "balanced")
    if preset_name not in SIGNAL_WEIGHT_PRESETS:
        preset_name = "balanced"

    return {
        "active_preset": preset_name,
        "available_presets": sorted(SIGNAL_WEIGHT_PRESETS.keys()),
        "weights": SIGNAL_WEIGHT_PRESETS[preset_name],
    }


def set_active_signal_preset(db: Session, preset_name: str) -> dict:
    if preset_name not in SIGNAL_WEIGHT_PRESETS:
        raise ValueError("Unknown signal preset")

    upsert_setting(db, "signal_weight_preset", {"preset_name": preset_name})
    return {
        "active_preset": preset_name,
        "available_presets": sorted(SIGNAL_WEIGHT_PRESETS.keys()),
        "weights": SIGNAL_WEIGHT_PRESETS[preset_name],
    }

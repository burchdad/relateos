from sqlalchemy.orm import Session

from app.models import SystemSetting


def get_setting(db: Session, key: str, default: dict | None = None) -> dict:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not row:
        return default.copy() if default else {}
    return row.value or {}


def upsert_setting(db: Session, key: str, value: dict) -> SystemSetting:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not row:
        row = SystemSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()
    db.refresh(row)
    return row

import base64
import hashlib
import hmac
import json
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import AppUser


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
HASH_ITERATIONS = 210_000


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _secret() -> bytes:
    return settings.auth_secret_key.encode("utf-8")


class AuthService:
    @staticmethod
    def normalize_email(email: str) -> str:
        return (email or "").strip().lower()

    @staticmethod
    def validate_email(email: str) -> bool:
        return bool(EMAIL_RE.match(AuthService.normalize_email(email)))

    @staticmethod
    def hash_password(password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, HASH_ITERATIONS)
        return f"pbkdf2_sha256${HASH_ITERATIONS}${_b64url_encode(salt)}${_b64url_encode(digest)}"

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        try:
            scheme, iterations_raw, salt_raw, digest_raw = password_hash.split("$", 3)
            if scheme != "pbkdf2_sha256":
                return False
            iterations = int(iterations_raw)
            salt = _b64url_decode(salt_raw)
            expected = _b64url_decode(digest_raw)
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False

    @staticmethod
    def create_user(db: Session, *, name: str, email: str, password: str) -> AppUser:
        normalized_email = AuthService.normalize_email(email)
        if not AuthService.validate_email(normalized_email):
            raise ValueError("Enter a valid email address.")
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters.")
        existing = db.query(AppUser).filter(AppUser.email == normalized_email).first()
        if existing:
            raise ValueError("An account with that email already exists.")

        user = AppUser(
            id=uuid.uuid4(),
            name=name.strip(),
            email=normalized_email,
            password_hash=AuthService.hash_password(password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def authenticate(db: Session, *, email: str, password: str) -> AppUser | None:
        user = db.query(AppUser).filter(AppUser.email == AuthService.normalize_email(email)).first()
        if not user or not user.is_active:
            return None
        if not AuthService.verify_password(password, user.password_hash):
            return None
        return user

    @staticmethod
    def issue_token(user: AppUser) -> str:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.auth_token_ttl_hours)
        payload: dict[str, Any] = {
            "sub": str(user.id),
            "email": user.email,
            "exp": int(expires_at.timestamp()),
        }
        payload_raw = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signature = hmac.new(_secret(), payload_raw.encode("ascii"), hashlib.sha256).digest()
        return f"{payload_raw}.{_b64url_encode(signature)}"

    @staticmethod
    def verify_token(db: Session, token: str) -> AppUser | None:
        try:
            payload_raw, signature_raw = token.split(".", 1)
            expected = hmac.new(_secret(), payload_raw.encode("ascii"), hashlib.sha256).digest()
            if not hmac.compare_digest(_b64url_decode(signature_raw), expected):
                return None
            payload = json.loads(_b64url_decode(payload_raw).decode("utf-8"))
            if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
                return None
            user_id = uuid.UUID(str(payload.get("sub")))
        except Exception:
            return None

        user = db.query(AppUser).filter(AppUser.id == user_id).first()
        if not user or not user.is_active:
            return None
        return user

    @staticmethod
    def bearer_user(db: Session, authorization: str | None) -> AppUser | None:
        if not authorization:
            return None
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return None
        return AuthService.verify_token(db, token)

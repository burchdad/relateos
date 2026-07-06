import base64
import struct
import hashlib
import hmac
import json
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import AppUser, PasswordResetToken, RegistrationVerification, Workspace
from app.schemas.auth import ProfileSetupRequest
from app.services.email_service import EmailService


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
HASH_ITERATIONS = 210_000
TOTP_INTERVAL_SECONDS = 30
TOTP_DIGITS = 6
REGISTRATION_CODE_TTL_MINUTES = 10


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _secret() -> bytes:
    return settings.auth_secret_key.encode("utf-8")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _base32_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _base32_decode(secret: str) -> bytes:
    cleaned = re.sub(r"\s+", "", secret or "").upper()
    padding = "=" * (-len(cleaned) % 8)
    return base64.b32decode(cleaned + padding, casefold=True)


def _totp_code(secret: str, counter: int) -> str:
    key = _base32_decode(secret)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10 ** TOTP_DIGITS)).zfill(TOTP_DIGITS)


def _verify_totp(secret: str | None, code: str | None, *, window: int = 1) -> bool:
    if not secret or not code:
        return False
    cleaned = re.sub(r"\D+", "", code)
    if len(cleaned) != TOTP_DIGITS:
        return False
    current_counter = int(time.time() // TOTP_INTERVAL_SECONDS)
    for drift in range(-window, window + 1):
        if hmac.compare_digest(_totp_code(secret, current_counter + drift), cleaned):
            return True
    return False


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
        workspace = Workspace(id=uuid.uuid4(), name=f"{user.name}'s Workspace", owner_user_id=user.id)
        user.workspace_id = workspace.id
        db.add(workspace)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def start_registration_verification(db: Session, *, name: str, email: str, password: str) -> dict[str, str]:
        normalized_email = AuthService.normalize_email(email)
        clean_name = name.strip()
        if len(clean_name) < 2:
            raise ValueError("Name must be at least 2 characters.")
        if not AuthService.validate_email(normalized_email):
            raise ValueError("Enter a valid email address.")
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters.")
        existing = db.query(AppUser).filter(AppUser.email == normalized_email).first()
        if existing:
            raise ValueError("An account with that email already exists.")

        now = datetime.now(timezone.utc)
        db.query(RegistrationVerification).filter(
            RegistrationVerification.email == normalized_email,
            RegistrationVerification.used_at.is_(None),
        ).update({"used_at": now})

        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge_token = secrets.token_urlsafe(32)
        verification = RegistrationVerification(
            id=uuid.uuid4(),
            email=normalized_email,
            name=clean_name,
            password_hash=AuthService.hash_password(password),
            code_hash=_token_hash(f"{normalized_email}:{code}"),
            challenge_hash=_token_hash(challenge_token),
            expires_at=now + timedelta(minutes=REGISTRATION_CODE_TTL_MINUTES),
        )
        db.add(verification)
        db.commit()

        EmailService.send_registration_code(
            to_email=normalized_email,
            name=clean_name,
            code=code,
            idempotency_key=f"registration-verification-{verification.id}",
        )
        return {
            "email_verification_challenge_token": challenge_token,
            "message": "Check your email for a verification code to finish creating your account.",
        }

    @staticmethod
    def complete_registration_verification(
        db: Session,
        *,
        email: str,
        code: str | None,
        challenge_token: str | None,
    ) -> AppUser:
        normalized_email = AuthService.normalize_email(email)
        cleaned_code = re.sub(r"\D+", "", code or "")
        if len(cleaned_code) != 6 or not challenge_token:
            raise ValueError("Enter the six-digit code from your email.")

        verification = (
            db.query(RegistrationVerification)
            .filter(
                RegistrationVerification.email == normalized_email,
                RegistrationVerification.challenge_hash == _token_hash(challenge_token),
                RegistrationVerification.used_at.is_(None),
            )
            .first()
        )
        now = datetime.now(timezone.utc)
        if not verification:
            raise ValueError("This verification code is invalid or expired.")

        expires_at = verification.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now:
            verification.used_at = now
            db.commit()
            raise ValueError("This verification code is invalid or expired.")

        if not hmac.compare_digest(verification.code_hash, _token_hash(f"{normalized_email}:{cleaned_code}")):
            raise ValueError("Invalid verification code.")

        existing = db.query(AppUser).filter(AppUser.email == normalized_email).first()
        if existing:
            verification.used_at = now
            db.commit()
            raise ValueError("An account with that email already exists.")

        user = AppUser(
            id=uuid.uuid4(),
            name=verification.name,
            email=normalized_email,
            password_hash=verification.password_hash,
        )
        workspace = Workspace(id=uuid.uuid4(), name=f"{user.name}'s Workspace", owner_user_id=user.id)
        user.workspace_id = workspace.id
        verification.used_at = now
        db.add(workspace)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def update_profile(db: Session, user: AppUser, payload: ProfileSetupRequest) -> AppUser:
        user.name = payload.name.strip()
        user.company_name = payload.company_name.strip()
        user.role_title = payload.role_title.strip()
        user.relationship_focus = payload.relationship_focus.strip()
        user.primary_goal = payload.primary_goal.strip()
        user.timezone = payload.timezone.strip()
        user.wants_calendar_connection = payload.wants_calendar_connection
        user.wants_contact_import = payload.wants_contact_import
        user.onboarding_complete = True
        if not user.workspace_id:
            workspace = Workspace(id=uuid.uuid4(), name=payload.company_name.strip(), owner_user_id=user.id)
            user.workspace_id = workspace.id
            db.add(workspace)
        else:
            workspace = db.query(Workspace).filter(Workspace.id == user.workspace_id).first()
            if workspace:
                workspace.name = payload.company_name.strip()
                workspace.owner_user_id = workspace.owner_user_id or user.id
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def request_password_reset(db: Session, *, email: str) -> None:
        normalized_email = AuthService.normalize_email(email)
        if not AuthService.validate_email(normalized_email):
            return
        user = db.query(AppUser).filter(AppUser.email == normalized_email).first()
        if not user or not user.is_active:
            return

        now = datetime.now(timezone.utc)
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).update({"used_at": now})

        token = secrets.token_urlsafe(32)
        reset_token = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=_token_hash(token),
            expires_at=now + timedelta(minutes=settings.password_reset_token_ttl_minutes),
        )
        db.add(reset_token)
        db.commit()

        reset_url = f"{settings.frontend_app_url.rstrip('/')}/reset-password?token={quote(token)}"
        EmailService.send_password_reset(
            to_email=user.email,
            name=user.name,
            reset_url=reset_url,
            idempotency_key=f"password-reset-{reset_token.id}",
        )

    @staticmethod
    def reset_password(db: Session, *, token: str, password: str) -> None:
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters.")

        reset_token = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.token_hash == _token_hash(token),
                PasswordResetToken.used_at.is_(None),
            )
            .first()
        )
        now = datetime.now(timezone.utc)
        if not reset_token:
            raise ValueError("This password reset link is invalid or expired.")

        expires_at = reset_token.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now:
            raise ValueError("This password reset link is invalid or expired.")

        user = db.query(AppUser).filter(AppUser.id == reset_token.user_id).first()
        if not user or not user.is_active:
            raise ValueError("This password reset link is invalid or expired.")

        user.password_hash = AuthService.hash_password(password)
        reset_token.used_at = now
        db.commit()

    @staticmethod
    def authenticate(db: Session, *, email: str, password: str) -> AppUser | None:
        user = db.query(AppUser).filter(AppUser.email == AuthService.normalize_email(email)).first()
        if not user or not user.is_active:
            return None
        if not AuthService.verify_password(password, user.password_hash):
            return None
        return user

    @staticmethod
    def issue_2fa_challenge(user: AppUser) -> str:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        payload: dict[str, Any] = {
            "sub": str(user.id),
            "purpose": "2fa",
            "nonce": secrets.token_urlsafe(12),
            "exp": int(expires_at.timestamp()),
        }
        payload_raw = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signature = hmac.new(_secret(), payload_raw.encode("ascii"), hashlib.sha256).digest()
        return f"{payload_raw}.{_b64url_encode(signature)}"

    @staticmethod
    def verify_2fa_challenge(db: Session, token: str | None, user: AppUser) -> bool:
        if not token:
            return False
        try:
            payload_raw, signature_raw = token.split(".", 1)
            expected = hmac.new(_secret(), payload_raw.encode("ascii"), hashlib.sha256).digest()
            if not hmac.compare_digest(_b64url_decode(signature_raw), expected):
                return False
            payload = json.loads(_b64url_decode(payload_raw).decode("utf-8"))
            if payload.get("purpose") != "2fa":
                return False
            if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
                return False
            user_id = uuid.UUID(str(payload.get("sub")))
        except Exception:
            return False
        return user_id == user.id and db.query(AppUser.id).filter(AppUser.id == user.id, AppUser.is_active.is_(True)).first() is not None

    @staticmethod
    def verify_two_factor_code(user: AppUser, code: str | None) -> bool:
        return _verify_totp(user.two_factor_secret, code)

    @staticmethod
    def two_factor_status(user: AppUser) -> dict[str, bool]:
        return {"enabled": bool(user.two_factor_enabled)}

    @staticmethod
    def start_two_factor_setup(db: Session, user: AppUser) -> dict[str, str]:
        secret = _base32_secret()
        user.two_factor_pending_secret = secret
        db.commit()
        label = quote(f"Teifke Relationships:{user.email}")
        issuer = quote("Teifke Relationships")
        return {
            "secret": secret,
            "otpauth_url": f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&digits={TOTP_DIGITS}&period={TOTP_INTERVAL_SECONDS}",
        }

    @staticmethod
    def enable_two_factor(db: Session, user: AppUser, code: str) -> None:
        secret = user.two_factor_pending_secret or user.two_factor_secret
        if not _verify_totp(secret, code):
            raise ValueError("Invalid authenticator code.")
        user.two_factor_secret = secret
        user.two_factor_pending_secret = None
        user.two_factor_enabled = True
        db.commit()

    @staticmethod
    def disable_two_factor(db: Session, user: AppUser, code: str) -> None:
        if user.two_factor_enabled and not _verify_totp(user.two_factor_secret, code):
            raise ValueError("Invalid authenticator code.")
        user.two_factor_enabled = False
        user.two_factor_secret = None
        user.two_factor_pending_secret = None
        db.commit()

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

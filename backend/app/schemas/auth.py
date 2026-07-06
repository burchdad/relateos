from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: UUID
    workspace_id: UUID | None = None
    email: str
    name: str
    company_name: str | None = None
    role_title: str | None = None
    relationship_focus: str | None = None
    primary_goal: str | None = None
    timezone: str | None = None
    wants_calendar_connection: bool = False
    wants_contact_import: bool = False
    onboarding_complete: bool = False
    two_factor_enabled: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    email_verification_code: str | None = Field(default=None, max_length=12)
    email_verification_challenge_token: str | None = Field(default=None, max_length=255)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    two_factor_code: str | None = Field(default=None, max_length=12)
    two_factor_challenge_token: str | None = Field(default=None, max_length=512)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class ProfileSetupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    company_name: str = Field(min_length=2, max_length=255)
    role_title: str = Field(min_length=2, max_length=255)
    relationship_focus: str = Field(min_length=2, max_length=100)
    primary_goal: str = Field(min_length=2, max_length=100)
    timezone: str = Field(min_length=2, max_length=100)
    wants_calendar_connection: bool = False
    wants_contact_import: bool = False


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class LoginResponse(BaseModel):
    token: str | None = None
    user: UserOut | None = None
    requires_2fa: bool = False
    two_factor_challenge_token: str | None = None
    message: str | None = None


class RegisterResponse(BaseModel):
    token: str | None = None
    user: UserOut | None = None
    requires_email_verification: bool = False
    email_verification_challenge_token: str | None = None
    message: str | None = None


class TwoFactorStatusResponse(BaseModel):
    enabled: bool


class TwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class TwoFactorVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.auth import (
    AuthResponse,
    EmailDiagnosticsResponse,
    EmailTestResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginResponse,
    LoginRequest,
    ProfileSetupRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    TwoFactorSetupResponse,
    TwoFactorStatusResponse,
    TwoFactorVerifyRequest,
    UserOut,
)
from app.services.auth_service import AuthService
from app.services.email_service import EmailService


router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(db: Session, user) -> AuthResponse:
    return AuthResponse(token=AuthService.issue_token(user), user=UserOut.model_validate(AuthService.user_out(db, user)))


@router.post("/register", response_model=RegisterResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    try:
        if payload.email_verification_code:
            user = AuthService.complete_registration_verification(
                db,
                email=payload.email,
                code=payload.email_verification_code,
                challenge_token=payload.email_verification_challenge_token,
                invitation_token=payload.invitation_token,
            )
            auth = _auth_response(db, user)
            return RegisterResponse(token=auth.token, user=auth.user)
        challenge = AuthService.start_registration_verification(
            db,
            name=payload.name,
            email=payload.email,
            password=payload.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return RegisterResponse(
        requires_email_verification=True,
        email_verification_challenge_token=challenge["email_verification_challenge_token"],
        message=challenge["message"],
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = AuthService.authenticate(db, email=payload.email, password=payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if user.two_factor_enabled:
        if payload.two_factor_code:
            if not AuthService.verify_2fa_challenge(db, payload.two_factor_challenge_token, user):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Two-factor challenge expired. Sign in again.")
            if not AuthService.verify_two_factor_code(user, payload.two_factor_code):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authenticator code")
            auth = _auth_response(db, user)
            return LoginResponse(token=auth.token, user=auth.user)
        return LoginResponse(
            requires_2fa=True,
            two_factor_challenge_token=AuthService.issue_2fa_challenge(user),
            message="Enter your authenticator app code.",
        )
    auth = _auth_response(db, user)
    return LoginResponse(token=auth.token, user=auth.user)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    AuthService.request_password_reset(db, email=payload.email)
    return ForgotPasswordResponse(
        message="If an account exists for that email, password reset instructions will be sent."
    )


@router.get("/email/diagnostics", response_model=EmailDiagnosticsResponse)
def email_diagnostics(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return EmailService.diagnostics()


@router.post("/email/test", response_model=EmailTestResponse)
def email_test(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    sent = EmailService.send_diagnostic_email(
        to_email=user.email,
        name=user.name,
        idempotency_key=f"diagnostic-email-{user.id}",
    )
    if not sent:
        return EmailTestResponse(
            sent=False,
            message="Test email was not accepted. Check RESEND_API_KEY, AUTH_EMAIL_FROM, and domain verification.",
        )
    return EmailTestResponse(sent=True, message=f"Test email sent to {user.email}.")


@router.post("/reset-password", response_model=ForgotPasswordResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        AuthService.reset_password(db, token=payload.token, password=payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ForgotPasswordResponse(message="Your password has been updated. You can sign in now.")


@router.get("/me", response_model=UserOut)
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return AuthService.user_out(db, user)


@router.put("/profile", response_model=UserOut)
def update_profile(
    payload: ProfileSetupRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    updated = AuthService.update_profile(db, user, payload)
    return AuthService.user_out(db, updated)


@router.get("/2fa/status", response_model=TwoFactorStatusResponse)
def two_factor_status(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return AuthService.two_factor_status(user)


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def two_factor_setup(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return AuthService.start_two_factor_setup(db, user)


@router.post("/2fa/enable", response_model=TwoFactorStatusResponse)
def two_factor_enable(
    payload: TwoFactorVerifyRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        AuthService.enable_two_factor(db, user, payload.code)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return AuthService.two_factor_status(user)


@router.post("/2fa/disable", response_model=TwoFactorStatusResponse)
def two_factor_disable(
    payload: TwoFactorVerifyRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        AuthService.disable_two_factor(db, user, payload.code)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return AuthService.two_factor_status(user)

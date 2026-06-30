from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    ProfileSetupRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
)
from app.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(user) -> AuthResponse:
    return AuthResponse(token=AuthService.issue_token(user), user=UserOut.model_validate(user))


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    try:
        user = AuthService.create_user(db, name=payload.name, email=payload.email, password=payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = AuthService.authenticate(db, email=payload.email, password=payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _auth_response(user)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    AuthService.request_password_reset(db, email=payload.email)
    return ForgotPasswordResponse(
        message="If an account exists for that email, password reset instructions will be sent."
    )


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
    return user


@router.put("/profile", response_model=UserOut)
def update_profile(
    payload: ProfileSetupRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user = AuthService.bearer_user(db, authorization)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return AuthService.update_profile(db, user, payload)

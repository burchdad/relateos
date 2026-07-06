from fastapi import HTTPException, Request, status

from app.models.entities import AppUser


def current_user(request: Request) -> AppUser:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user

from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import RevokedToken, User
from .security import decode_access_token


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> tuple[User, dict[str, Any]]:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing access token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError as exc:
        raise unauthorized from exc

    jti = payload.get("jti")
    subject = payload.get("sub")
    if payload.get("type") != "access" or not jti or not subject:
        raise unauthorized

    revoked = db.scalar(select(RevokedToken).where(RevokedToken.jti == jti))
    if revoked:
        raise unauthorized

    try:
        user = db.get(User, int(subject))
    except (TypeError, ValueError) as exc:
        raise unauthorized from exc
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive or no longer exists")
    return user, payload


def require_admin(current_auth: tuple[User, dict[str, Any]] = Depends(get_current_auth)) -> User:
    user, _ = current_auth
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin permission required")
    return user

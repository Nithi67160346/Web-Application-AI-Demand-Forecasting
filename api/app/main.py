from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, engine, get_db
from .deps import get_current_auth
from .models import RevokedToken, User
from .schemas import (
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
    UsernameCheckResponse,
    UsersPage,
)
from .security import create_access_token, hash_password, verify_password


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Authentication and user management API for the Demandly project.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalized_email(email: str | None) -> str | None:
    return email.strip().lower() if email else None


def public_user(user: User) -> UserResponse:
    return UserResponse.model_validate(user)


@app.get("/health", tags=["System"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "demandly-api"}


@app.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED, tags=["Authentication"])
def register(payload: UserCreate, db: Session = Depends(get_db)) -> TokenResponse:
    username = payload.username.strip().lower()
    email = normalized_email(str(payload.email) if payload.email else None)
    duplicate_conditions = [User.username == username]
    if email:
        duplicate_conditions.append(User.email == email)
    duplicate = db.scalar(select(User).where(or_(*duplicate_conditions)))
    if duplicate:
        detail = "Username or email is already registered"
        if duplicate.username == username:
            detail = "Username is already registered"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    user = User(
        username=username,
        email=email,
        full_name=payload.full_name.strip() if payload.full_name else None,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email is already registered") from exc
    db.refresh(user)
    token, _, expires_at = create_access_token(user.id, user.username)
    expires_in = max(0, int((expires_at - datetime.now(timezone.utc)).total_seconds()))
    return TokenResponse(access_token=token, expires_in=expires_in, user=public_user(user))


@app.post("/login", response_model=TokenResponse, tags=["Authentication"])
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    login_value = payload.username_or_email.strip().lower()
    user = db.scalar(select(User).where(or_(User.username == login_value, User.email == login_value)))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Username/email or password is incorrect")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    token, _, expires_at = create_access_token(user.id, user.username)
    expires_in = max(0, int((expires_at - datetime.now(timezone.utc)).total_seconds()))
    return TokenResponse(access_token=token, expires_in=expires_in, user=public_user(user))


@app.post("/logout", response_model=MessageResponse, tags=["Authentication"])
def logout(current_auth: tuple[User, dict] = Depends(get_current_auth), db: Session = Depends(get_db)) -> MessageResponse:
    _, payload = current_auth
    expires_at = datetime.fromtimestamp(int(payload["exp"]), timezone.utc)
    if db.get(RevokedToken, payload["jti"]) is None:
        db.add(RevokedToken(jti=payload["jti"], expires_at=expires_at))
        db.commit()
    return MessageResponse(message="Logged out successfully")


@app.post("/change-password", response_model=MessageResponse, tags=["Authentication"])
def change_password(
    payload: ChangePasswordRequest,
    current_auth: tuple[User, dict] = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> MessageResponse:
    user, _ = current_auth
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password changed successfully")


@app.get("/me", response_model=UserResponse, tags=["User management"])
def get_me(current_auth: tuple[User, dict] = Depends(get_current_auth)) -> UserResponse:
    user, _ = current_auth
    return public_user(user)


@app.get("/check-username/{name}", response_model=UsernameCheckResponse, tags=["User management"])
def check_username(name: str, db: Session = Depends(get_db)) -> UsernameCheckResponse:
    normalized = name.strip().lower()
    if len(normalized) < 3:
        return UsernameCheckResponse(username=normalized, available=False)
    exists = db.scalar(select(User.id).where(User.username == normalized)) is not None
    return UsernameCheckResponse(username=normalized, available=not exists)


@app.get("/users", response_model=UsersPage, tags=["User management"])
def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    _: tuple[User, dict] = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> UsersPage:
    total = db.scalar(select(func.count()).select_from(User)) or 0
    rows = db.scalars(select(User).order_by(User.id).offset(skip).limit(limit)).all()
    return UsersPage(items=[public_user(user) for user in rows], total=total, skip=skip, limit=limit)


@app.get("/users/{user_id}", response_model=UserResponse, tags=["User management"])
def get_user(user_id: int, _: tuple[User, dict] = Depends(get_current_auth), db: Session = Depends(get_db)) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return public_user(user)


@app.put("/users/{user_id}", response_model=UserResponse, tags=["User management"])
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_auth: tuple[User, dict] = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> UserResponse:
    current_user, _ = current_auth
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only update your own profile")
    if payload.role is not None and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can change roles")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.email is not None:
        target.email = normalized_email(str(payload.email))
    if payload.full_name is not None:
        target.full_name = payload.full_name.strip()
    if payload.is_active is not None and current_user.role == "admin":
        target.is_active = payload.is_active
    if payload.role is not None:
        target.role = payload.role
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered") from exc
    db.refresh(target)
    return public_user(target)


@app.delete("/users/{user_id}", response_model=MessageResponse, tags=["User management"])
def delete_user(
    user_id: int,
    current_auth: tuple[User, dict] = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> MessageResponse:
    current_user, _ = current_auth
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin permission required to delete another user")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.delete(target)
    db.commit()
    return MessageResponse(message="User deleted successfully")

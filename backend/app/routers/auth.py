"""auth.py router v8."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..database import get_db
from ..models import User, LoginAttempt
from ..schemas import UserRegister, UserLogin, TokenPair, RefreshRequest, UserOut
from ..auth import hash_password, verify_password, create_token_pair, rotate_refresh_token, get_current_user
from ..services.security.audit import audit, AuditAction
from ..config import get_settings

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])
UTC = timezone.utc


@router.post("/register", response_model=TokenPair, status_code=201)
async def register(body: UserRegister, request: Request, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")
    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.flush()
    await db.refresh(user)
    tokens = await create_token_pair(db, user.id)
    await audit(db, AuditAction.AUTH_REGISTER, user_id=user.id,
                resource_type="user", resource_id=user.id, detail={"email": user.email}, request=request)
    return tokens


@router.post("/login", response_model=TokenPair)
async def login(body: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    async def record(success: bool):
        db.add(LoginAttempt(email=body.email, ip_address=ip[:45], success=success))

    if not user:
        await record(False)
        await audit(db, AuditAction.AUTH_LOGIN_FAILED, detail={"email": body.email, "reason": "not_found"}, request=request)
        raise HTTPException(401, "Invalid credentials")

    if user.is_locked:
        if user.locked_until and datetime.now(UTC) < user.locked_until:
            remaining = int((user.locked_until - datetime.now(UTC)).total_seconds())
            raise HTTPException(423, f"Account locked. Retry in {remaining}s")
        user.is_locked = False; user.failed_login_count = 0

    if not user.is_active:
        raise HTTPException(403, "Account disabled")

    if not verify_password(body.password, user.hashed_password):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.LOGIN_MAX_ATTEMPTS:
            user.is_locked = True
            user.locked_until = datetime.now(UTC) + timedelta(seconds=settings.LOGIN_LOCKOUT_SECONDS)
            await record(False)
            await audit(db, AuditAction.AUTH_USER_LOCKED, user_id=user.id,
                        detail={"attempts": user.failed_login_count}, request=request)
            raise HTTPException(423, f"Account locked after {settings.LOGIN_MAX_ATTEMPTS} failed attempts")
        await record(False)
        await audit(db, AuditAction.AUTH_LOGIN_FAILED, user_id=user.id,
                    detail={"attempts": user.failed_login_count}, request=request)
        raise HTTPException(401, "Invalid credentials")

    user.failed_login_count = 0; user.is_locked = False
    await record(True)
    tokens = await create_token_pair(db, user.id)
    await audit(db, AuditAction.AUTH_LOGIN, user_id=user.id, request=request)
    return tokens


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    tokens = await rotate_refresh_token(db, body.refresh_token)
    await audit(db, AuditAction.AUTH_REFRESH_ROTATED, request=request)
    return tokens


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user

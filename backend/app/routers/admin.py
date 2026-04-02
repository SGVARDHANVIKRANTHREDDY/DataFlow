"""
Admin Router v10 — super_admin role hierarchy.

FIX: Who can grant admin?
  v9: any admin could grant admin → unbounded escalation.
  v10: only super_admin can grant/revoke admin.
  
  Role hierarchy:
    user → admin (promoted by super_admin)
    admin → super_admin (promoted by existing super_admin only)
  
  self-demotion: always forbidden (super_admin cannot remove their own super status)
  
NEW: GET /admin/audit/verify-global — checks for gaps in global_seq sequence.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from ..database import get_db
from ..models import User, DeadLetterEntry, AuditLog, Job
from ..auth import get_current_user
from ..services.dead_letter import replay_dlq_entry
from ..services.security.audit import (
    verify_audit_chain, verify_global_sequence_integrity,
    AuditAction, audit
)
from ..config import get_settings

settings = get_settings()
router  = APIRouter(prefix="/admin", tags=["admin"])
limiter = Limiter(key_func=get_remote_address)


async def require_admin(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> User:
    if not user.is_admin and not user.is_super_admin:
        raise HTTPException(403, "Admin access required")
    return user


async def require_super_admin(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> User:
    if not user.is_super_admin:
        raise HTTPException(403, "Super-admin access required for this operation")
    return user


@router.get("/dlq")
@limiter.limit(settings.RATE_LIMIT_ADMIN)
async def list_dlq(request: Request, page: int = 1, replayed: bool = False, suppressed: bool = False,
                    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    await audit(db, AuditAction.ADMIN_DLQ_VIEW, user_id=admin.id,
                detail={"page": page}, request=request)
    offset = (page - 1) * 20
    total = (await db.execute(select(func.count(DeadLetterEntry.id)).where(
        DeadLetterEntry.replayed == replayed, DeadLetterEntry.suppressed == suppressed))).scalar_one()
    items = (await db.execute(
        select(DeadLetterEntry).where(
            DeadLetterEntry.replayed == replayed, DeadLetterEntry.suppressed == suppressed)
        .order_by(desc(DeadLetterEntry.created_at)).offset(offset).limit(20)
    )).scalars().all()
    return {"items": [{"id": e.id, "task_name": e.task_name, "queue": e.queue,
                       "error": e.error[:200], "retry_count": e.retry_count,
                       "replay_count": e.replay_count, "suppressed": e.suppressed,
                       "created_at": e.created_at.isoformat()} for e in items], "total": total}


@router.post("/dlq/{entry_id}/replay")
@limiter.limit(settings.RATE_LIMIT_ADMIN_CRITICAL)
async def replay_dlq(request: Request, entry_id: int,
                      db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    await audit(db, AuditAction.DLQ_REPLAY, user_id=admin.id,
                detail={"entry_id": entry_id, "phase": "attempt"}, request=request)
    try:
        result = await replay_dlq_entry(entry_id, admin_user_id=admin.id)
        await audit(db, AuditAction.DLQ_REPLAY, user_id=admin.id,
                    detail={"entry_id": entry_id, "phase": "success",
                            "new_task": result.get("new_celery_task_id")}, request=request)
        return result
    except ValueError as e:
        await audit(db, AuditAction.DLQ_REPLAY, user_id=admin.id,
                    detail={"entry_id": entry_id, "phase": "rejected", "reason": str(e)}, request=request)
        raise HTTPException(400, str(e))


@router.get("/audit")
@limiter.limit(settings.RATE_LIMIT_ADMIN)
async def query_audit(request: Request, page: int = 1, action: str | None = None,
                       user_id: int | None = None, resource_type: str | None = None,
                       db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    await audit(db, AuditAction.ADMIN_VIEW_AUDIT, user_id=admin.id,
                detail={"filters": {"action": action, "user_id": user_id}}, request=request)
    offset = (page - 1) * 50
    q = select(AuditLog).order_by(desc(AuditLog.created_at))
    if action: q = q.where(AuditLog.action == action)
    if user_id: q = q.where(AuditLog.user_id == user_id)
    if resource_type: q = q.where(AuditLog.resource_type == resource_type)
    total = (await db.execute(select(func.count(AuditLog.id)))).scalar_one()
    items = (await db.execute(q.offset(offset).limit(50))).scalars().all()
    return {"items": [{"id": e.id, "global_seq": e.global_seq, "user_id": e.user_id,
                       "action": e.action, "resource_type": e.resource_type,
                       "resource_id": e.resource_id, "ip_address": e.ip_address,
                       "detail": e.detail, "created_at": e.created_at.isoformat()}
                      for e in items], "total": total}


@router.get("/audit/verify")
@limiter.limit(settings.RATE_LIMIT_ADMIN)
async def verify_audit(request: Request, user_id: int | None = None, limit: int = 1000,
                        db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """Verify per-user HMAC chain integrity."""
    result = await verify_audit_chain(db, user_id=user_id, limit=limit)
    await audit(db, AuditAction.AUDIT_CHAIN_VERIFY, user_id=admin.id,
                detail={"verified_user_id": user_id, "valid": result.get("valid")}, request=request)
    return result


@router.get("/audit/verify-global")
@limiter.limit(settings.RATE_LIMIT_ADMIN)
async def verify_global_audit(request: Request, limit: int = 10000,
                               db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """Check for gaps in global_seq — indicates deleted audit entries (tamper detection)."""
    result = await verify_global_sequence_integrity(db, limit=limit)
    await audit(db, AuditAction.AUDIT_GLOBAL_VERIFY, user_id=admin.id,
                detail={"valid": result.get("valid"), "gaps": result.get("gaps_found")}, request=request)
    return result


@router.post("/users/{target_id}/grant-admin")
@limiter.limit(settings.RATE_LIMIT_ADMIN_CRITICAL)
async def grant_admin(request: Request, target_id: int,
                       db: AsyncSession = Depends(get_db),
                       admin: User = Depends(require_super_admin)):
    """Only super_admin can grant admin. Prevents unbounded privilege escalation."""
    r = await db.execute(select(User).where(User.id == target_id))
    target = r.scalar_one_or_none()
    if not target: raise HTTPException(404, "User not found")
    if target.is_admin: return {"user_id": target_id, "is_admin": True, "message": "Already admin"}
    target.is_admin = True
    await db.flush()
    await audit(db, AuditAction.ADMIN_GRANT_ADMIN, user_id=admin.id,
                resource_type="user", resource_id=target_id,
                detail={"granted_by": admin.id, "email": target.email}, request=request)
    return {"user_id": target_id, "is_admin": True}


@router.post("/users/{target_id}/revoke-admin")
@limiter.limit(settings.RATE_LIMIT_ADMIN_CRITICAL)
async def revoke_admin(request: Request, target_id: int,
                        db: AsyncSession = Depends(get_db),
                        admin: User = Depends(require_super_admin)):
    if target_id == admin.id:
        raise HTTPException(400, "Cannot revoke your own admin access")
    r = await db.execute(select(User).where(User.id == target_id))
    target = r.scalar_one_or_none()
    if not target: raise HTTPException(404, "User not found")
    target.is_admin = False
    await db.flush()
    await audit(db, AuditAction.ADMIN_REVOKE_ADMIN, user_id=admin.id,
                resource_type="user", resource_id=target_id,
                detail={"revoked_by": admin.id}, request=request)
    return {"user_id": target_id, "is_admin": False}


@router.post("/users/{target_id}/grant-super-admin")
@limiter.limit(settings.RATE_LIMIT_ADMIN_CRITICAL)
async def grant_super_admin(request: Request, target_id: int,
                             db: AsyncSession = Depends(get_db),
                             admin: User = Depends(require_super_admin)):
    """Grant super_admin — only existing super_admin can do this."""
    if target_id == admin.id:
        raise HTTPException(400, "Cannot self-grant super-admin")
    r = await db.execute(select(User).where(User.id == target_id))
    target = r.scalar_one_or_none()
    if not target: raise HTTPException(404, "User not found")
    target.is_super_admin = True; target.is_admin = True
    await db.flush()
    await audit(db, AuditAction.ADMIN_GRANT_SUPER, user_id=admin.id,
                resource_type="user", resource_id=target_id,
                detail={"granted_by": admin.id, "email": target.email}, request=request)
    return {"user_id": target_id, "is_super_admin": True}


@router.get("/jobs/failed")
@limiter.limit(settings.RATE_LIMIT_ADMIN)
async def list_failed_jobs(request: Request, page: int = 1,
                            db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    offset = (page - 1) * 20
    total = (await db.execute(select(func.count(Job.id)).where(Job.status == "failed"))).scalar_one()
    items = (await db.execute(
        select(Job).where(Job.status == "failed")
        .order_by(desc(Job.created_at)).offset(offset).limit(20)
    )).scalars().all()
    return {"items": [{"id": j.id, "job_type": j.job_type, "error": j.error,
                       "created_at": j.created_at.isoformat()} for j in items], "total": total}


@router.get('/dlq')
async def list_dlq(db: AsyncSession = Depends(get_db)):
    from ..models import DeadLetterQueue
    result = await db.execute(select(DeadLetterQueue).order_by(DeadLetterQueue.created_at.desc()).limit(100))
    items = result.scalars().all()
    return items

@router.post('/dlq/{dlq_id}/retry')
async def retry_dlq(dlq_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    from ..models import DeadLetterQueue
    import json
    from ..celery_app import celery_app
    result = await db.execute(select(DeadLetterQueue).where(DeadLetterQueue.id == dlq_id))
    dlq_item = result.scalar_one_or_none()
    if not dlq_item: raise HTTPException(404, 'DLQ item not found')
    if dlq_item.status != 'pending': raise HTTPException(400, 'Only pending items can be retried')
    
    try:
        payload = json.loads(dlq_item.payload)
        args = payload.get('args', [])
        kwargs = payload.get('kwargs', {})
        # Push back into Celery
        celery_app.send_task(dlq_item.task_name, args=args, kwargs=kwargs)
        dlq_item.status = 'retried'
        dlq_item.resolved_at = func.now()
        await db.commit()
        return {'status': 'retried'}
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f'Failed to re-drive DLQ: {e}')

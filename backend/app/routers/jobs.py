"""jobs.py — poll background job status (frontend polls this after upload/execute)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..database import get_db
from ..models import User, Job
from ..auth import get_current_user
from ..schemas import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("", response_model=list[JobOut])
async def list_jobs(
    page: int = 1, page_size: int = 20, job_type: str | None = None,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    page_size = min(page_size, 50)
    q = select(Job).where(Job.user_id == user.id)
    if job_type:
        q = q.where(Job.job_type == job_type)
    q = q.order_by(Job.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    return (await db.execute(q)).scalars().all()

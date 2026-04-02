"""pipelines.py v10 — execution deduplication (exactly-once), API-level idempotency."""
import uuid, logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..database import get_db
from ..db.routing import read_db, write_db
from ..models import User, Dataset, Pipeline, PipelineExecution, Job
from ..auth import get_current_user
from ..schemas import (PipelineCreate, PipelineUpdate, PipelineOut, PipelineList,
                       ExecuteRequest, ExecutionOut, TranslateRequest, TranslateResponse)
from ..services.validator import validate_ai_output, detect_schema_mismatch
from ..services.ai_translator import translate_to_steps
from ..services.tasks import execute_pipeline_task
from ..services.storage import get_signed_url_async
from ..services.security.audit import audit, AuditAction
from sqlalchemy import case
from datetime import datetime, timedelta
from ..services.security.idempotency import (
    require_idempotency_key, get_or_create_idempotency_key,
    complete_idempotency_key, fail_idempotency_key, hash_request_body,
    claim_execution_dedup, complete_execution_dedup,
)
from ..middleware.tracing import inject_trace_into_celery_kwargs
from ..config import get_settings

settings = get_settings()
logger   = logging.getLogger(__name__)
router   = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.post("", response_model=PipelineOut, status_code=201)
async def create_pipeline(body: PipelineCreate, db: AsyncSession = Depends(write_db),
                           user: User = Depends(get_current_user), request: Request = None):
    steps = [s.model_dump() for s in body.steps]
    pipe  = Pipeline(user_id=user.id, dataset_id=body.dataset_id, name=body.name, steps=steps)
    db.add(pipe); await db.flush(); await db.refresh(pipe)
    await audit(db, AuditAction.PIPELINE_CREATE, user_id=user.id,
                resource_type="pipeline", resource_id=pipe.id,
                detail={"name": pipe.name, "steps": len(steps)}, request=request)
    return pipe


@router.get("", response_model=PipelineList)
async def list_pipelines(page: int = 1, page_size: int = 20,
                          db: AsyncSession = Depends(read_db),
                          user: User = Depends(get_current_user)):
    page_size = min(page_size, 100); offset = (page - 1) * page_size
    total = (await db.execute(select(func.count(Pipeline.id)).where(Pipeline.user_id == user.id))).scalar_one()
    items = (await db.execute(
        select(Pipeline).where(Pipeline.user_id == user.id)
        .order_by(Pipeline.updated_at.desc()).offset(offset).limit(page_size)
    )).scalars().all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{pid}", response_model=PipelineOut)
async def get_pipeline(pid: int, db: AsyncSession = Depends(read_db),
                        user: User = Depends(get_current_user)):
    return await _req_pipe(db, pid, user.id)


@router.patch("/{pid}", response_model=PipelineOut)
async def update_pipeline(pid: int, body: PipelineUpdate, db: AsyncSession = Depends(write_db),
                           user: User = Depends(get_current_user), request: Request = None):
    pipe = await _req_pipe(db, pid, user.id)
    if body.name  is not None: pipe.name  = body.name
    if body.steps is not None: pipe.steps = [s.model_dump() for s in body.steps]
    await db.flush(); await db.refresh(pipe)
    await audit(db, AuditAction.PIPELINE_UPDATE, user_id=user.id,
                resource_type="pipeline", resource_id=pipe.id, request=request)
    return pipe


@router.delete("/{pid}", status_code=204)
async def delete_pipeline(pid: int, db: AsyncSession = Depends(write_db),
                           user: User = Depends(get_current_user), request: Request = None):
    pipe = await _req_pipe(db, pid, user.id)
    await audit(db, AuditAction.PIPELINE_DELETE, user_id=user.id,
                resource_type="pipeline", resource_id=pipe.id, request=request)
    await db.delete(pipe)


@router.post("/translate", response_model=TranslateResponse)
async def translate(body: TranslateRequest, db: AsyncSession = Depends(get_db),
                    user: User = Depends(get_current_user), request: Request = None):
    columns = None
    if body.dataset_id:
        r = await db.execute(select(Dataset).where(Dataset.id == body.dataset_id, Dataset.user_id == user.id))
        ds = r.scalar_one_or_none()
        if ds and ds.headers: columns = ds.headers
    raw = await translate_to_steps(body.prompt, columns)
    validated = validate_ai_output(raw, columns)
    await audit(db, AuditAction.PIPELINE_TRANSLATE, user_id=user.id,
                detail={"prompt": body.prompt[:100], "steps_accepted": len(validated["steps"])}, request=request)
    return validated


@router.post("/{pid}/execute", response_model=dict, status_code=202)
async def execute(
    pid: int,
    body: ExecuteRequest,
    request: Request,
    idem_key: str = Depends(require_idempotency_key),
    db: AsyncSession = Depends(write_db),
    user: User = Depends(get_current_user),
):
    try:
        from ..services.reliability import UnifiedJobOrchestrator
        from ..services.security.idempotency import hash_request_body
        
        body_bytes = await request.body()
        result = await UnifiedJobOrchestrator.dispatch_pipeline_execution(
            db, user.id, pid, body.dataset_id, idem_key, hash_request_body(body_bytes)
        )
        return result
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        from fastapi import HTTPException
        import logging
        logging.getLogger(__name__).exception("Transactional Execution failed")
        raise HTTPException(status_code=500, detail="Transactional Execution failed")



@router.get("/metrics/activity")
async def get_activity_metrics(db: AsyncSession = Depends(read_db), user: User = Depends(get_current_user)):
    fourteen_days_ago = datetime.utcnow() - timedelta(days=14)
    
    # We join PipelineExecution to Pipeline to filter by user_id securely
    query = (
        select(
            func.date(PipelineExecution.created_at).label('d'),
            func.count(PipelineExecution.id).label('total'),
            func.sum(case((PipelineExecution.status == 'success', 1), else_=0)).label('success')
        )
        .join(Pipeline, PipelineExecution.pipeline_id == Pipeline.id)
        .where(
            Pipeline.user_id == user.id,
            PipelineExecution.created_at >= fourteen_days_ago
        )
        .group_by('d')
        .order_by('d')
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    # Map the DB rows to an easy to use dictionary
    row_map = {row.d.strftime("%Y-%m-%d"): {"executions": row.total, "success": int(row.success or 0)} for row in rows}
    
    # Fill in the blanks for the last 14 days
    out = []
    for i in range(13, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
        if d in row_map:
            out.append({"date": d, "executions": row_map[d]["executions"], "success": row_map[d]["success"]})
        else:
            out.append({"date": d, "executions": 0, "success": 0})
            
    return out


@router.get("/{pid}/executions", response_model=list[ExecutionOut])
async def list_executions(pid: int, db: AsyncSession = Depends(read_db),
                           user: User = Depends(get_current_user)):
    await _req_pipe(db, pid, user.id)
    result = await db.execute(
        select(PipelineExecution).where(PipelineExecution.pipeline_id == pid)
        .order_by(PipelineExecution.created_at.desc()).limit(20)
    )
    execs = result.scalars().all()
    out = []
    for ex in execs:
        d = ExecutionOut.model_validate(ex)
        if ex.output_s3_key and ex.status in ("success", "partial"):
            try: d.download_url = await get_signed_url_async(ex.output_s3_key, settings.S3_BUCKET_OUTPUT)
            except Exception: pass
        out.append(d)
    return out


@router.get("/{pid}/executions/{eid}", response_model=ExecutionOut)
async def get_execution(pid: int, eid: int, db: AsyncSession = Depends(read_db),
                         user: User = Depends(get_current_user)):
    await _req_pipe(db, pid, user.id)
    result = await db.execute(
        select(PipelineExecution).where(PipelineExecution.id == eid, PipelineExecution.pipeline_id == pid)
    )
    ex = result.scalar_one_or_none()
    if not ex: raise HTTPException(404, "Execution not found")
    d = ExecutionOut.model_validate(ex)
    if ex.output_s3_key and ex.status in ("success", "partial"):
        try: d.download_url = await get_signed_url_async(ex.output_s3_key, settings.S3_BUCKET_OUTPUT)
        except Exception: pass
    return d


@router.post("/{pid}/fork", response_model=PipelineOut, status_code=201)
async def fork_pipeline(pid: int, db: AsyncSession = Depends(write_db),
                        user: User = Depends(get_current_user), request: Request = None):
    """Deep copy an existing pipeline (clones steps)."""
    old = await _req_pipe(db, pid, user.id)
    
    new_pipe = Pipeline(
        user_id=user.id,
        dataset_id=old.dataset_id,
        name=f"{old.name} (Fork)",
        steps=old.steps[:] # Clone list explicitly
    )
    db.add(new_pipe)
    await db.flush()
    await db.refresh(new_pipe)
    
    await audit(db, AuditAction.PIPELINE_CREATE, user_id=user.id,
                resource_type="pipeline", resource_id=new_pipe.id,
                detail={"forked_from": pid}, request=request)
    await db.commit()
    return new_pipe


async def _req_pipe(db: AsyncSession, pid: int, user_id: int) -> Pipeline:
    r = await db.execute(select(Pipeline).where(Pipeline.id == pid, Pipeline.user_id == user_id))
    p = r.scalar_one_or_none()
    if not p: raise HTTPException(404, "Pipeline not found")
    return p


async def _req_dataset(db: AsyncSession, dataset_id: int, user_id: int) -> Dataset:
    r = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user_id))
    d = r.scalar_one_or_none()
    if not d: raise HTTPException(404, "Dataset not found")
    return d

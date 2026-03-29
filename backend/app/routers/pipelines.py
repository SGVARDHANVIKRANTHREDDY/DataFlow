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
    # Layer 1: API-level idempotency key REQUIRED for execute
    idem_key: str = Depends(require_idempotency_key),
    db: AsyncSession = Depends(write_db),
    user: User = Depends(get_current_user),
):
    """
    Exactly-once execution with two-layer deduplication:

    Layer 1 (API): require_idempotency_key dependency ensures client sends
                   Idempotency-Key header — handles network retries.

    Layer 2 (Execution dedup): claim_execution_dedup uses deterministic key
                   f"exec:{user_id}:{pipeline_id}:{dataset_id}" — handles
                   cases where client sends different keys on retry.

    Both layers required for true exactly-once.
    """
    pipe = await _req_pipe(db, pid, user.id)
    ds   = await _req_dataset(db, body.dataset_id, user.id)

    # Layer 1: API idempotency — check for replay
    body_bytes = await request.body()
    idem_result = await get_or_create_idempotency_key(
        db, user.id, idem_key, f"/pipelines/{pid}/execute", hash_request_body(body_bytes)
    )
    if idem_result["action"] == "replay":
        return idem_result["body"]

    try:
        # Layer 2: Execution deduplication — prevents duplicate even with different Idempotency-Key
        dedup_result = await claim_execution_dedup(db, user.id, pid, body.dataset_id, pipe.steps)
        if dedup_result["action"] == "duplicate":
            # Same pipeline+dataset ran recently — return previous execution
            result = {
                "execution_id": dedup_result.get("existing_execution_id"),
                "job_id": None,
                "status": "deduplicated",
                "message": dedup_result.get("message"),
            }
            await complete_idempotency_key(db, user.id, idem_key, 202, result)
            return result

        # Pre-validate steps
        schema_warnings = detect_schema_mismatch(pipe.steps, ds.headers or [])

        execution = PipelineExecution(
            pipeline_id=pid, input_dataset_id=body.dataset_id,
            status="pending", schema_warnings=schema_warnings or None,
            idempotency_key=idem_key,
        )
        db.add(execution); await db.flush(); await db.refresh(execution)

        job = Job(user_id=user.id, job_type="execute",
                  payload={"pipeline_id": pid, "dataset_id": body.dataset_id,
                           "execution_id": execution.id}, status="pending")
        db.add(job); await db.flush(); await db.refresh(job)
        await db.commit()

        # Dispatch with deterministic task_id for retry-safe exactly-once
        deterministic_task_id = f"exec-{execution.id}"
        task = execute_pipeline_task.apply_async(
            args=[execution.id, pid, body.dataset_id, user.id, job.id, pipe.steps],
            kwargs=inject_trace_into_celery_kwargs({}),
            task_id=deterministic_task_id,
        )
        execution.job_id = task.id
        job.celery_task_id = task.id
        await db.commit()

        # Complete both idempotency layers
        result = {"execution_id": execution.id, "job_id": job.id,
                  "celery_task_id": task.id, "status": "pending"}
        await complete_idempotency_key(db, user.id, idem_key, 202, result)
        await complete_execution_dedup(db, user.id, pid, body.dataset_id, pipe.steps, execution.id)
        await db.commit()

        await audit(db, AuditAction.PIPELINE_EXECUTE, user_id=user.id,
                    resource_type="pipeline", resource_id=pid,
                    detail={"execution_id": execution.id, "dataset_id": body.dataset_id,
                            "idem_key": idem_key[:8]}, request=request)
        logger.info("Execution %d dispatched (task %s)", execution.id, task.id)
        return result

    except Exception:
        await fail_idempotency_key(db, user.id, idem_key)
        raise


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

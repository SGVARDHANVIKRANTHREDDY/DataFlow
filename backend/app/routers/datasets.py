"""
datasets.py v8.

FIX: file.read() was called before the size check — entire 2GB file loaded
into memory before rejection. Streaming size check now rejects immediately.

FIX: S3 upload now uses upload_file_async (asyncio.to_thread), not blocking boto3.

NEW: Upload concurrency semaphore — limits concurrent in-memory uploads to
UPLOAD_MAX_CONCURRENT (default 20) to prevent OOM from 100 simultaneous large uploads.
"""
import uuid, logging, asyncio
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..database import get_db
from ..db.routing import read_db, write_db
from ..models import User, Dataset, Job
from ..auth import get_current_user
from ..schemas import DatasetOut, DatasetList
from ..services.storage import (upload_file_async, upload_csv_from_df_async,
                                  delete_object_async, generate_upload_key, download_file_to_df)
from ..services.profiler import generate_smart_suggestions, detect_anomalies
from ..services.tasks import profile_dataset_task
from ..services.security.csv_sanitizer import validate_and_sanitize_csv, is_csv_content, SecurityError
from ..services.security.audit import audit, AuditAction
from ..services.security.idempotency import (
    require_idempotency_key, get_idempotency_key_from_request,
    get_or_create_idempotency_key, complete_idempotency_key,
    fail_idempotency_key, hash_request_body
)
from ..config import get_settings

settings = get_settings()
logger   = logging.getLogger(__name__)
router   = APIRouter(prefix="/datasets", tags=["datasets"])

# Semaphore: prevents OOM from concurrent large uploads
_upload_semaphore = asyncio.Semaphore(settings.UPLOAD_MAX_CONCURRENT)


@router.post("", response_model=dict, status_code=202)
async def upload_dataset(
    request: Request,
    db: AsyncSession = Depends(write_db),
    user: User = Depends(get_current_user),
):
    """
    Upload CSV with streaming size check (FIX: no full read before check).
    Protected by concurrency semaphore (FIX: OOM prevention).
    """
    # ── Streaming size check — rejects before full read ───────
    content_length = request.headers.get("content-length")
    if content_length:
        cl = int(content_length)
        if cl > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(413, f"File too large ({cl} bytes). Max {settings.MAX_UPLOAD_SIZE_MB}MB")

    # ── Concurrency guard ─────────────────────────────────────
    if _upload_semaphore.locked() and _upload_semaphore._value == 0:
        raise HTTPException(503, "Upload queue full — please retry in a few seconds")

    async with _upload_semaphore:
        return await _do_upload(request, db, user)


async def _do_upload(request: Request, db: AsyncSession, user: User) -> dict:
    # Parse multipart manually for streaming
    from fastapi import UploadFile
    form = await request.form()
    file: UploadFile = form.get("file")
    if not file:
        raise HTTPException(400, "No file provided")

    # Streaming read with size enforcement
    chunks = []
    total = 0
    async for chunk in file:
        total += len(chunk)
        if total > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(413, f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit")
        chunks.append(chunk)
    content = b"".join(chunks)

    if len(content) == 0:
        raise HTTPException(400, "File is empty")

    # ── Idempotency ───────────────────────────────────────────
    idem_key = get_idempotency_key_from_request(request)
    if idem_key:
        idem_result = await get_or_create_idempotency_key(
            db, user.id, idem_key, "/datasets", hash_request_body(content))
        if idem_result["action"] == "replay":
            return idem_result["body"]

    filename = file.filename or "upload.csv"
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        if idem_key: await fail_idempotency_key(db, user.id, idem_key)
        await audit(db, AuditAction.SECURITY_FILE_REJECTED, user_id=user.id,
                    detail={"filename": filename, "reason": "bad_extension"}, request=request)
        raise HTTPException(400, f"Only CSV files allowed. Got: .{ext}")

    if not is_csv_content(content, filename):
        if idem_key: await fail_idempotency_key(db, user.id, idem_key)
        await audit(db, AuditAction.SECURITY_FILE_REJECTED, user_id=user.id,
                    detail={"filename": filename, "reason": "bad_magic_bytes"}, request=request)
        raise HTTPException(400, "File content is not valid CSV")

    # ── CSV Sanitization ──────────────────────────────────────
    try:
        sanitized = validate_and_sanitize_csv(
            content,
            max_columns=settings.CSV_MAX_COLUMNS,
            max_cell_length=settings.CSV_MAX_CELL_LENGTH,
            max_rows=settings.CSV_MAX_ROWS,
            max_column_name_length=settings.CSV_MAX_COLUMN_NAME_LENGTH,
        )
    except SecurityError as e:
        quarantine_key = f"quarantine/{user.id}/{uuid.uuid4().hex}.csv"
        try: await upload_file_async(content, quarantine_key, settings.S3_BUCKET_QUARANTINE)
        except Exception: pass
        await audit(db, AuditAction.DATASET_QUARANTINED, user_id=user.id,
                    detail={"filename": filename, "error": str(e)}, request=request)
        if idem_key: await fail_idempotency_key(db, user.id, idem_key)
        raise HTTPException(422, {"error": {"type": "SECURITY_ERROR", "message": str(e)}})

    if sanitized.cells_sanitized > 0:
        await audit(db, AuditAction.SECURITY_CSV_INJECTION, user_id=user.id,
                    detail={"filename": filename, "cells": sanitized.cells_sanitized,
                            "encoding": sanitized.detected_encoding}, request=request)

    # ── Async S3 upload (FIX: was blocking boto3 in v7) ──────
    import io
    s3_key = generate_upload_key(user.id, filename)
    buf = io.BytesIO(); sanitized.df.to_csv(buf, index=False); buf.seek(0)
    try:
        await upload_file_async(buf.getvalue(), s3_key, settings.S3_BUCKET_RAW)
    except RuntimeError as e:
        if "circuit breaker" in str(e).lower():
            if idem_key: await fail_idempotency_key(db, user.id, idem_key)
            raise HTTPException(503, "Storage temporarily unavailable — please retry in 30s")
        raise
    except Exception as e:
        logger.error("S3 upload failed: %s", e)
        if idem_key: await fail_idempotency_key(db, user.id, idem_key)
        raise HTTPException(502, "Storage unavailable — please retry")

    # ── Persist dataset + job atomically ─────────────────────
    dataset = Dataset(
        user_id=user.id, name=filename, original_filename=filename,
        s3_key=s3_key, row_count=len(sanitized.df), col_count=len(sanitized.df.columns),
        file_size_bytes=len(content), profiling_status="pending", file_hash=sanitized.file_hash,
    )
    db.add(dataset)
    await db.flush()
    await db.refresh(dataset)

    job = Job(user_id=user.id, job_type="profile", payload={"dataset_id": dataset.id}, status="pending")
    db.add(job)
    await db.flush()
    await db.refresh(job)
    await db.commit()

    task = profile_dataset_task.apply_async(
        args=[dataset.id, user.id, job.id],
        task_id=f"profile-{dataset.id}-{uuid.uuid4().hex[:8]}",
    )
    job.celery_task_id = task.id
    await db.commit()

    await audit(db, AuditAction.DATASET_UPLOAD, user_id=user.id,
                resource_type="dataset", resource_id=dataset.id,
                detail={"filename": filename, "rows": len(sanitized.df),
                        "hash": sanitized.file_hash[:12]}, request=request)

    result = {"dataset_id": dataset.id, "job_id": job.id, "celery_task_id": task.id,
              "warnings": sanitized.warnings}

    if idem_key:
        await complete_idempotency_key(db, user.id, idem_key, 202, result)
        await db.commit()

    return result


@router.get("", response_model=DatasetList)
async def list_datasets(
    page: int = 1, page_size: int = 20,
    db: AsyncSession = Depends(read_db),
    user: User = Depends(get_current_user),
):
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count(Dataset.id)).where(Dataset.user_id == user.id))).scalar_one()
    items = (await db.execute(
        select(Dataset).where(Dataset.user_id == user.id)
        .order_by(Dataset.created_at.desc()).offset(offset).limit(page_size)
    )).scalars().all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{dataset_id}", response_model=DatasetOut)
async def get_dataset(dataset_id: int, db: AsyncSession = Depends(read_db), user: User = Depends(get_current_user)):
    return await _req_ds(db, dataset_id, user.id)


@router.get("/{dataset_id}/suggestions")
async def get_suggestions(dataset_id: int, db: AsyncSession = Depends(read_db), user: User = Depends(get_current_user)):
    ds = await _req_ds(db, dataset_id, user.id)
    return {"suggestions": generate_smart_suggestions(ds.profile) if ds.profile else []}


@router.get("/compare")
async def compare_datasets(
    id1: int,
    id2: int,
    db: AsyncSession = Depends(read_db),
    user: User = Depends(get_current_user)
):
    """
    Returns a high-level statistical comparison between two datasets.
    Properly isolates by tenant (user_id).
    """
    ds1 = await db.get(Dataset, id1)
    ds2 = await db.get(Dataset, id2)
    
    if not ds1 or not ds2 or ds1.user_id != user.id or ds2.user_id != user.id:
        raise HTTPException(status_code=404, detail="One or both datasets not found")
        
    def _extract_stats(ds: Dataset):
        if not ds.profile:
            return {"ready": False}
        p = ds.profile
        return {
            "ready": True,
            "name": ds.name,
            "health_score": p.get("health_score"),
            "row_count": ds.row_count,
            "col_count": ds.col_count,
            "missing_cells": p.get("missing_cells"),
            "duplicate_rows": p.get("duplicate_rows"),
            "memory_usage_mb": p.get("memory_usage_mb"),
        }

    return {
        "dataset1": _extract_stats(ds1),
        "dataset2": _extract_stats(ds2)
    }

@router.get("/{dataset_id}/anomalies")
async def get_dataset_anomalies(
    dataset_id: int,
    db: AsyncSession = Depends(read_db),
    user: User = Depends(get_current_user)
):
    """
    On-demand lightweight Anomaly Detection scan on the dataset CSV, 
    identifying highly-deviant rows using Max Z-Score evaluation.
    Properly enforced tenant isolation inside _req_ds.
    """
    ds = await _req_ds(db, dataset_id, user.id)
    
    # Needs to use the correct S3 download method and handle errors gracefully
    try:
        from ..services.storage import download_to_df
        df = await download_to_df(ds.s3_key, settings.S3_BUCKET_RAW)
        anomalies = detect_anomalies(df)
        return {"anomalies": anomalies, "total_scanned": len(df)}
    except Exception as e:
        logger.error("Failed to download dataset %d for anomaly detection: %s", dataset_id, e)
        raise HTTPException(502, "Storage unavailable — please retry")


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: int, request: Request,
                          db: AsyncSession = Depends(write_db), user: User = Depends(get_current_user)):
    ds = await _req_ds(db, dataset_id, user.id)
    await delete_object_async(ds.s3_key, settings.S3_BUCKET_RAW)
    await audit(db, AuditAction.DATASET_DELETE, user_id=user.id,
                resource_type="dataset", resource_id=ds.id, detail={"name": ds.name}, request=request)
    await db.delete(ds)


async def _req_ds(db: AsyncSession, dataset_id: int, user_id: int) -> Dataset:
    r = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user_id))
    ds = r.scalar_one_or_none()
    if not ds: raise HTTPException(404, "Dataset not found")
    return ds

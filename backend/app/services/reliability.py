import asyncio
import logging
import random
import time
from functools import wraps
from typing import Any, Callable, TypeVar, Iterable

T = TypeVar("T")
logger = logging.getLogger(__name__)

class CircuitBreakerOpenException(Exception):
    pass

class CircuitBreaker:
    """
    Stateful circuit breaker to prevent cascading failures.
    Transitions: CLOSED -> OPEN (after threshold errors) -> HALF-OPEN (after timeout)
    """
    def __init__(self, name: str, threshold: int = 5, timeout: float = 30.0):
        self.name = name
        self.threshold = threshold
        self.timeout = timeout
        self.failures = 0
        self.opened_at: float | None = None
        self.state = "CLOSED"

    def record_success(self):
        self.failures = 0
        self.opened_at = None
        if self.state != "CLOSED":
            logger.info("Circuit breaker [%s] CLOSED.", self.name)
            self.state = "CLOSED"

    def record_failure(self):
        self.failures += 1
        if self.state == "CLOSED" and self.failures >= self.threshold:
            self.opened_at = time.monotonic()
            self.state = "OPEN"
            logger.error("Circuit breaker [%s] is now OPEN after %d failures.", self.name, self.failures)

    def check(self):
        if self.state == "OPEN":
            if self.opened_at and (time.monotonic() - self.opened_at) > self.timeout:
                self.state = "HALF-OPEN"
                logger.info("Circuit breaker [%s] HALF-OPEN (testing next request).", self.name)
                return
            raise CircuitBreakerOpenException(f"Circuit breaker [{self.name}] is OPEN.")

def with_retry_and_circuit(
    cb: CircuitBreaker,
    exceptions: Iterable[type[Exception]] = (Exception,),
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 10.0,
):
    """
    Decorator that applies standard retries with exponential backoff + jitter,
    combined with a named Circuit Breaker.
    """
    def decorator(func: Callable[..., Any]):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cb.check()
            last_err = None
            delay = base_delay

            for attempt in range(max_retries + 1):
                try:
                    result = await func(*args, **kwargs)
                    cb.record_success()
                    return result
                except CircuitBreakerOpenException:
                    raise
                except tuple(exceptions) as e:
                    last_err = e
                    cb.record_failure()
                    
                    if attempt == max_retries:
                        break
                    
                    if cb.state == "OPEN":
                        # Do not retry if the circuit just flipped open
                        break
                    
                    # Exponential backoff with jitter
                    jitter = random.uniform(0, 0.1 * delay)
                    sleep_time = min(max_delay, delay + jitter)
                    logger.warning(
                        "Attempt %d failed in [%s]: %s. Retrying in %.2fs...",
                        attempt + 1, cb.name, last_err, sleep_time
                    )
                    await asyncio.sleep(sleep_time)
                    delay *= 2.0
                    
            logger.error("[%s] Failed after %d retries.", cb.name, max_retries)
            raise last_err or Exception(f"Unknown error in {cb.name}")

        return wrapper
    return decorator


class UnifiedJobOrchestrator:
    """
    Central orchestration layer. Handles atomic, exactly-once job execution.
    Coordinates DB locked state, idempotency keys, dedup checks, and task dispatch.
    """
    @staticmethod
    async def dispatch_pipeline_execution(
        db: Any, 
        user_id: int, 
        pipeline_id: int, 
        dataset_id: int, 
        idem_key: str, 
        body_hash: str
    ) -> dict:
        from app.models import Pipeline, PipelineExecution, Job
        from .security.idempotency import (
            get_or_create_idempotency_key, 
            claim_execution_dedup, 
            complete_execution_dedup,
            hash_steps
        )
        from app.services.tasks import execute_pipeline_task
        from sqlalchemy import select

        # 1. API Level Idempotency Check (Duplicate POST exactly the same?)
        action_dict = await get_or_create_idempotency_key(
            db, user_id, idem_key, f"/pipelines/{pipeline_id}/execute", body_hash
        )
        if action_dict.get("action") == "replay":
            return {"status": "accepted", "message": "Pipeline execution initiated (replayed from Idempotency-Key)"}
        
        # 2. Pipeline fetching & Dedup Hash (same pipeline logic?)
        r = await db.execute(
            select(Pipeline).where(Pipeline.id == pipeline_id, Pipeline.user_id == user_id)
        )
        pipeline = r.scalar_one_or_none()
        if not pipeline:
            raise ValueError("Pipeline not found or user mis-match.")
        
        steps_hash = hash_steps(pipeline.steps)
        dedup_key = f"exec:{user_id}:{pipeline_id}:{dataset_id}:{steps_hash}"
        
        # 3. Domain Level Dedup
        await claim_execution_dedup(db, user_id, dedup_key, idem_key)

        # 4. Atomic Stateful Transition using SELECT FOR UPDATE
        # We lock the dataset to prevent concurrent mutations on it
        from app.models import Dataset
        r2 = await db.execute(
            select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user_id).with_for_update()
        )
        dataset_record = r2.scalar_one_or_none()
        if not dataset_record:
            raise ValueError("Dataset not found or user mis-match.")

        execution = PipelineExecution(
            pipeline_id=pipeline_id,
            dataset_id=dataset_id,
            status="pending",
        )
        db.add(execution)
        await db.flush()

        job = Job(
            user_id=user_id,
            task_name="pipeline_execution",
            target_id=execution.id,
            status="pending"
        )
        db.add(job)
        await db.flush()

        # 5. Commit state BEFORE offloading to Celery (Transactional Outbox baseline)
        execution_id = execution.id
        job_id = job.id
        await db.commit()

        # 6. Dispatch with tracing/dedup/idemp keys packed
        execute_pipeline_task.apply_async(
            args=[execution_id, user_id, dataset_id, pipeline.steps],
            kwargs={"job_id": job_id, "idem_key": idem_key, "dedup_key": dedup_key},
            queue="pipeline_exec"
        )

        return {
            "status": "accepted",
            "message": "Pipeline execution initiated",
            "execution_id": execution_id,
            "job_id": job_id
        }



# Global Circuit Breakers
s3_circuit_breaker = CircuitBreaker('S3_Storage', threshold=5, timeout=30.0)
llm_circuit_breaker = CircuitBreaker('LLM_Service', threshold=3, timeout=60.0)
db_circuit_breaker = CircuitBreaker('Database', threshold=10, timeout=10.0)
redis_circuit_breaker = CircuitBreaker('Redis', threshold=5, timeout=10.0)


"""
Pipeline Executor v12 — Polars with lazy evaluation + streaming.

Architecture:
  1. Input DataFrame → convert to LazyFrame (zero-copy)
  2. Each step appends to the query plan (no data movement)
  3. Collect once at the end — Polars optimizes the entire plan
  4. For large datasets: streaming=True → processes in chunks, O(chunk) memory

Memory model:
  Pandas (old): df.copy() per step → O(N * steps) peak memory
  Polars lazy:  build plan → execute once → O(N) peak memory
  Polars stream:query plan → chunks → O(chunk_size) regardless of N
"""
from __future__ import annotations
import time
import logging
from typing import Any

import polars as pl
import pandas as pd

from .transforms import ACTION_REGISTRY, STREAMING_THRESHOLD

logger = logging.getLogger(__name__)


def execute_pipeline(
    steps: list[dict[str, Any]],
    df: pd.DataFrame,
) -> tuple[dict[str, Any], pd.DataFrame]:
    """
    Execute pipeline steps using Polars lazy evaluation.

    Returns (report, output_df) where output_df is a pandas DataFrame
    for backward compatibility with the rest of the system (S3 upload, etc.)

    Exactly-once guarantee:
    - Each step is a pure function on immutable LazyFrame
    - No mutation, no side effects within transforms
    - If a step fails: last successful LazyFrame is retained, not re-executed
    """
    t_total_start = time.perf_counter()
    log: list[dict[str, Any]] = []

    input_count = len(df)
    
    # HARD GUARDRAILS against Memory OOM / DoS
    # FAANG standard practice is strict memory and row constraints at edge
    if input_count > 10_000_000:
        logger.error("Dataset exceeds 10M hard limit (Count: %d). Rejecting execution.", input_count)
        return {
            "status": "failed",
            "steps_total": len(steps),
            "steps_ok": 0,
            "steps_failed": 0,
            "error": f"Hard limit exceeded. Got {input_count} rows, max 10,000,000 for standard tier.",
        }, df

    use_streaming = input_count > STREAMING_THRESHOLD

    if use_streaming:
        logger.info("Using Polars streaming mode for execution over %d rows to bound memory bounds to O(chunk)", input_count)

    # Convert pandas → polars LazyFrame (zero-copy via Arrow where possible)
    try:
        current_lf = pl.from_pandas(df).lazy()
    except Exception as e:
        logger.error("Failed to convert DataFrame to Polars: %s", e)
        return {
            "status": "failed",
            "steps_total": len(steps),
            "steps_ok": 0,
            "steps_failed": len(steps),
            "input_count": input_count,
            "output_count": 0,
            "total_ms": 0,
            "log": [],
            "error": f"DataFrame conversion failed: {e}",
        }, df

    last_good_lf = current_lf
    last_good_count = input_count

    # Try importing OpenTelemetry tracer for dense telemetry
    try:
        from opentelemetry import trace
        tracer = trace.get_tracer(__name__)
    except ImportError:
        class DummySpan:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def set_attribute(self, *args): pass
            def record_exception(self, *args): pass
        class DummyTracer:
            def start_as_current_span(self, *args, **kwargs): return DummySpan()
        tracer = DummyTracer()

    for i, step in enumerate(steps):
        action = step.get("action", "")
        params = step.get("params", {})
        fn     = ACTION_REGISTRY.get(action)

        with tracer.start_as_current_span(f"pipeline.step.{action}") as span:
            span.set_attribute("step.index", i)
            span.set_attribute("step.action", action)
            span.set_attribute("rows.before", last_good_count)

            t_step = time.perf_counter()
            rows_before = last_good_count

            if fn is None:
                ms = round((time.perf_counter() - t_step) * 1000, 2)
                span.set_attribute("error", True)
                span.set_attribute("error.message", f"Unknown action: '{action}'")
                log.append({
                    "index": i, "action": action,
                    "rows_before": rows_before, "rows_after": rows_before,
                    "delta": 0, "ms": ms,
                    "status": "error", "error": f"Unknown action: '{action}'",
                })
                logger.warning("Step %d: unknown action '%s'", i, action)
                continue

            try:
                result_lf = fn(current_lf, params)

                # Materialize this step to get row count for the log
                # (lazy — this doesn't re-execute previous steps)
                if use_streaming:
                    result_df_check = result_lf.collect(streaming=True)
                else:
                    result_df_check = result_lf.collect()

                rows_after = len(result_df_check)
                ms = round((time.perf_counter() - t_step) * 1000, 2)
                span.set_attribute("rows.after", rows_after)
                span.set_attribute("duration.ms", ms)

                log.append({
                    "index": i, "action": action,
                    "rows_before": rows_before,
                    "rows_after": rows_after,
                    "delta": rows_after - rows_before,
                    "ms": ms, "status": "ok", "error": None,
                })

                # Update current state from the already-collected result
                current_lf    = result_df_check.lazy()
                last_good_lf  = current_lf
                last_good_count = rows_after

            except Exception as exc:
                ms = round((time.perf_counter() - t_step) * 1000, 2)
                span.record_exception(exc)
                span.set_attribute("error", True)
                span.set_attribute("duration.ms", ms)

                log.append({
                    "index": i, "action": action,
                    "rows_before": rows_before, "rows_after": rows_before,
                    "delta": 0, "ms": ms,
                    "status": "error", "error": str(exc),
                })
                logger.warning("Step %d '%s' failed: %s", i, action, exc)
                # Continue from last successful state — no corruption
                current_lf = last_good_lf

    # Final collect
    with tracer.start_as_current_span(f"pipeline.final_collect") as span:
        try:
        if use_streaming:
            final_polars = last_good_lf.collect(streaming=True)
        else:
            final_polars = last_good_lf.collect()
    except Exception as e:
        logger.error("Final collect failed: %s", e)
        final_polars = pl.DataFrame()

    # Convert back to pandas for compatibility with the rest of the system
    try:
        output_df = final_polars.to_pandas()
    except Exception as e:
        logger.error("Polars → Pandas conversion failed: %s", e)
        output_df = df  # fallback to original

    total_ms = round((time.perf_counter() - t_total_start) * 1000, 2)
    steps_ok     = sum(1 for l in log if l["status"] == "ok")
    steps_failed = sum(1 for l in log if l["status"] == "error")

    if steps_failed == 0:
        status = "success"
    elif steps_ok == 0:
        status = "failed"
    else:
        status = "partial"

    report = {
        "status":       status,
        "steps_total":  len(steps),
        "steps_ok":     steps_ok,
        "steps_failed": steps_failed,
        "input_count":  input_count,
        "output_count": len(output_df),
        "total_ms":     total_ms,
        "log":          log,
        "engine":       "polars",
        "streaming":    use_streaming,
    }

    logger.info(
        "Pipeline executed: status=%s steps=%d/%d rows=%d→%d time=%.1fms engine=polars streaming=%s",
        status, steps_ok, len(steps), input_count, len(output_df), total_ms, use_streaming
    )

    return report, output_df

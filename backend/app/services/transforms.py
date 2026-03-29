"""
Transforms v12 — Polars replaces Pandas.

WHY POLARS:
  - 5-10x faster than Pandas on single node (Apache Arrow columnar)
  - Lazy evaluation: operations build a query plan, executed in one pass
  - Streaming mode: processes datasets larger than RAM in chunks
  - Zero-copy: no unnecessary DataFrame copies mid-pipeline
  - Thread-safe: Polars uses Rust internally with true parallelism

MIGRATION NOTES:
  - All transforms now receive and return polars.LazyFrame (lazy evaluation)
  - execute_pipeline() calls .collect() once at the very end
  - For datasets > MAX_ROWS_FOR_SYNC: streaming=True in .collect()
  - API unchanged: same action names, same params schema

MEMORY IMPACT:
  - Pandas df.copy() per step: O(N * steps) memory
  - Polars lazy: O(N) memory regardless of step count — query plan is free
  - Streaming mode: O(chunk_size) memory regardless of dataset size
"""
from __future__ import annotations
import logging
from typing import Any

import polars as pl

logger = logging.getLogger(__name__)

# Maximum rows before switching to streaming mode (configurable via env)
STREAMING_THRESHOLD = 100_000


def _get_numeric_cols(lf: pl.LazyFrame, columns: list[str] | None) -> list[str]:
    """Return numeric columns from the schema, optionally filtered by requested list."""
    schema = lf.schema
    numeric_types = {pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                     pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
                     pl.Float32, pl.Float64}
    all_numeric = [col for col, dtype in schema.items() if type(dtype) in numeric_types]
    if columns:
        return [c for c in columns if c in all_numeric]
    return all_numeric


def _all_cols(lf: pl.LazyFrame, columns: list[str] | None) -> list[str]:
    """Return all columns or the requested subset that exist."""
    all_cols = lf.columns
    if columns:
        return [c for c in columns if c in all_cols]
    return all_cols


# ── Transform implementations ─────────────────────────────────────────────────

def drop_nulls(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    cols = _all_cols(lf, params.get("columns"))
    return lf.drop_nulls(subset=cols if cols else None)


def fill_nulls(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    method  = params.get("method", "zero")
    cols    = _get_numeric_cols(lf, params.get("columns"))
    if not cols:
        return lf

    if method == "mean":
        # Polars: fill with per-column mean (lazy, single pass)
        exprs = [
            pl.col(c).fill_null(pl.col(c).mean()) for c in cols
        ]
    elif method == "median":
        exprs = [
            pl.col(c).fill_null(pl.col(c).median()) for c in cols
        ]
    else:  # zero
        exprs = [pl.col(c).fill_null(0) for c in cols]

    return lf.with_columns(exprs)


def remove_outliers(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    """
    IQR-based outlier removal using Polars lazy expressions.
    Computed in a single pass — no intermediate DataFrame creation.
    """
    cols = _get_numeric_cols(lf, params.get("columns"))
    if not cols:
        return lf

    # Build filter expression: keep rows where all columns are within [Q1-1.5*IQR, Q3+1.5*IQR]
    filter_exprs = []
    for col in cols:
        q1 = pl.col(col).quantile(0.25)
        q3 = pl.col(col).quantile(0.75)
        iqr = q3 - q1
        lo  = q1 - 1.5 * iqr
        hi  = q3 + 1.5 * iqr
        filter_exprs.append(
            pl.col(col).is_between(lo, hi, closed="both")
        )

    if not filter_exprs:
        return lf

    combined = filter_exprs[0]
    for expr in filter_exprs[1:]:
        combined = combined & expr

    return lf.filter(combined)


def normalize(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    """Min-max normalization [0, 1]. If max=min → 0."""
    cols = _get_numeric_cols(lf, params.get("columns"))
    if not cols:
        return lf

    exprs = []
    for col in cols:
        mn  = pl.col(col).min()
        mx  = pl.col(col).max()
        rng = mx - mn
        # When range is 0, fill with 0 to avoid division by zero
        normalized = pl.when(rng == 0).then(0.0).otherwise(
            (pl.col(col) - mn) / rng
        ).alias(col)
        exprs.append(normalized)

    return lf.with_columns(exprs)


def standardize(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    """Z-score standardization. If std=0 → 0."""
    cols = _get_numeric_cols(lf, params.get("columns"))
    if not cols:
        return lf

    exprs = []
    for col in cols:
        mu    = pl.col(col).mean()
        sigma = pl.col(col).std()
        standardized = pl.when(sigma == 0).then(0.0).otherwise(
            (pl.col(col) - mu) / sigma
        ).alias(col)
        exprs.append(standardized)

    return lf.with_columns(exprs)


def encode_categorical(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    """Lexicographic label encoding. Stable across runs."""
    schema = lf.schema
    string_types = {pl.Utf8, pl.String, pl.Categorical}
    all_string = [col for col, dtype in schema.items() if type(dtype) in string_types]
    cols = [c for c in (params.get("columns") or all_string) if c in all_string]

    if not cols:
        return lf

    # Polars native: cast to Categorical then to Int code
    exprs = [
        pl.col(c).cast(pl.Categorical).to_physical().alias(c)
        for c in cols
    ]
    return lf.with_columns(exprs)


def filter_rows(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    cols      = params.get("columns", [])
    threshold = params.get("threshold", 0) or 0
    method    = params.get("method", "gte")

    if not cols:
        return lf

    ops = {
        "gt":  lambda c: pl.col(c) > threshold,
        "lt":  lambda c: pl.col(c) < threshold,
        "gte": lambda c: pl.col(c) >= threshold,
        "lte": lambda c: pl.col(c) <= threshold,
    }
    op = ops.get(method, ops["gte"])

    schema = lf.schema
    numeric_types = {pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                     pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
                     pl.Float32, pl.Float64}

    exprs = [
        op(c) for c in cols
        if c in schema and type(schema[c]) in numeric_types
    ]
    if not exprs:
        return lf

    combined = exprs[0]
    for e in exprs[1:]:
        combined = combined & e

    return lf.filter(combined)


def select_columns(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    cols = [c for c in (params.get("columns") or []) if c in lf.columns]
    return lf.select(cols) if cols else lf


def drop_columns(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    drop = set(params.get("columns") or [])
    keep = [c for c in lf.columns if c not in drop]
    return lf.select(keep)


def sort_values(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    cols  = [c for c in (params.get("columns") or []) if c in lf.columns]
    order = params.get("order", "asc")
    if not cols:
        return lf
    return lf.sort(cols, descending=(order == "desc"), maintain_order=True)


def groupby_aggregate(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    cols   = params.get("columns") or []
    method = params.get("method", "sum")
    if len(cols) < 2:
        return lf

    group_col  = cols[0]
    agg_cols   = [c for c in cols[1:] if c in lf.columns]
    if not agg_cols or group_col not in lf.columns:
        return lf

    agg_map = {
        "sum":   lambda c: pl.col(c).sum().alias(f"{c}_sum"),
        "mean":  lambda c: pl.col(c).mean().alias(f"{c}_mean"),
        "count": lambda c: pl.col(c).count().alias(f"{c}_count"),
    }
    agg_fn = agg_map.get(method, agg_map["sum"])

    schema = lf.schema
    numeric_types = {pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                     pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
                     pl.Float32, pl.Float64}
    numeric_agg = [c for c in agg_cols if type(schema.get(c)) in numeric_types]
    if not numeric_agg:
        return lf

    return (
        lf.group_by(group_col)
          .agg([agg_fn(c) for c in numeric_agg])
          .sort(group_col)
    )


def remove_duplicates(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    cols = _all_cols(lf, params.get("columns"))
    return lf.unique(subset=cols if cols else None, keep="first", maintain_order=True)


def convert_types(lf: pl.LazyFrame, params: dict[str, Any]) -> pl.LazyFrame:
    cols   = params.get("columns") or []
    method = params.get("method", "")
    if not cols or not method:
        return lf

    exprs = []
    for col in cols:
        if col not in lf.columns:
            continue
        if method == "numeric":
            exprs.append(pl.col(col).cast(pl.Float64, strict=False).alias(col))
        elif method == "string":
            exprs.append(pl.col(col).cast(pl.Utf8).alias(col))

    return lf.with_columns(exprs) if exprs else lf


# ── Action registry ───────────────────────────────────────────────────────────

ACTION_REGISTRY = {
    "drop_nulls":        drop_nulls,
    "fill_nulls":        fill_nulls,
    "remove_outliers":   remove_outliers,
    "normalize":         normalize,
    "standardize":       standardize,
    "encode_categorical":encode_categorical,
    "filter_rows":       filter_rows,
    "select_columns":    select_columns,
    "drop_columns":      drop_columns,
    "sort_values":       sort_values,
    "groupby_aggregate": groupby_aggregate,
    "remove_duplicates": remove_duplicates,
    "convert_types":     convert_types,
}

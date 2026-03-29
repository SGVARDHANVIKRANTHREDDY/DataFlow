"""
3-Layer Validator — the sole gatekeeper before any pipeline execution.

Layer 1 — Schema:   action in registry, params is object, no extra keys
Layer 2 — Params:   types correct, method in per-action allowlist
Layer 3 — Columns:  referenced columns exist in dataset (warning, not hard error)

Returns structured errors matching the API error envelope.
"""
from __future__ import annotations
import re
from .transforms import ACTION_REGISTRY

ALLOWED_ACTIONS = frozenset(ACTION_REGISTRY.keys())
KNOWN_PARAM_KEYS = frozenset({"columns", "method", "threshold", "order"})

ALLOWED_METHODS: dict[str, frozenset[str]] = {
    "fill_nulls":        frozenset({"mean", "median", "zero", ""}),
    "remove_outliers":   frozenset({"iqr", ""}),
    "normalize":         frozenset({"minmax", ""}),
    "standardize":       frozenset({"zscore", ""}),
    "filter_rows":       frozenset({"gt", "lt", "gte", "lte", ""}),
    "groupby_aggregate": frozenset({"sum", "mean", "count", ""}),
    "convert_types":     frozenset({"numeric", "string", ""}),
    "sort_values":       frozenset({""}),
}

# Column name safety — prevent injection or weird chars
_COL_PATTERN = re.compile(r"^[\w\s\-\.\/\(\)]{1,200}$")


def validate_step(
    raw: dict,
    dataset_columns: list[str] | None = None,
    step_index: int = 0,
) -> dict:
    """
    Returns:
        {"valid": True,  "step": {...}, "warnings": [...]}
        {"valid": False, "reason": "...", "error_type": "..."}
    """
    if not isinstance(raw, dict):
        return _fail("SCHEMA_ERROR", "Step must be a JSON object", step_index)

    # ── Layer 1: Schema ───────────────────────────────────────
    action = raw.get("action")
    if not isinstance(action, str) or not action.strip():
        return _fail("SCHEMA_ERROR", "Missing or empty 'action' field", step_index)
    action = action.strip()
    if action not in ALLOWED_ACTIONS:
        return _fail(
            "UNKNOWN_ACTION",
            f"Unknown action '{action}'. Allowed: {sorted(ALLOWED_ACTIONS)}",
            step_index,
        )

    raw_params = raw.get("params", {})
    if not isinstance(raw_params, dict):
        return _fail("SCHEMA_ERROR", f"'params' must be a JSON object, got {type(raw_params).__name__}", step_index)

    extra = set(raw_params.keys()) - KNOWN_PARAM_KEYS
    if extra:
        return _fail(
            "SCHEMA_ERROR",
            f"Unknown param keys: {sorted(extra)}. Only allowed: {sorted(KNOWN_PARAM_KEYS)}",
            step_index,
        )

    # ── Layer 2: Params ───────────────────────────────────────
    params: dict = {}

    # columns
    raw_cols = raw_params.get("columns", [])
    if not isinstance(raw_cols, list):
        return _fail("PARAM_ERROR", f"params.columns must be an array, got {type(raw_cols).__name__}", step_index)
    if not all(isinstance(c, str) for c in raw_cols):
        return _fail("PARAM_ERROR", "params.columns must be string[]", step_index)
    cols = [c.strip() for c in raw_cols if c.strip()]
    for c in cols:
        if not _COL_PATTERN.match(c):
            return _fail("PARAM_ERROR", f"Column name contains invalid characters: '{c}'", step_index)
    params["columns"] = cols

    # method
    raw_method = raw_params.get("method", "")
    if not isinstance(raw_method, str):
        return _fail("PARAM_ERROR", f"params.method must be a string, got {type(raw_method).__name__}", step_index)
    method = raw_method.strip().lower()
    allowed = ALLOWED_METHODS.get(action)
    if allowed is not None and method not in allowed:
        method = ""   # soft reset — unknown method → use default
    params["method"] = method

    # threshold
    raw_threshold = raw_params.get("threshold")
    if raw_threshold is not None:
        try:
            t = float(raw_threshold)
            if not (-1e12 < t < 1e12):
                return _fail("PARAM_ERROR", f"params.threshold out of safe range: {t}", step_index)
            params["threshold"] = t
        except (TypeError, ValueError):
            return _fail("PARAM_ERROR", f"params.threshold must be a number or null, got '{raw_threshold}'", step_index)
    else:
        params["threshold"] = None

    # order
    raw_order = raw_params.get("order", "")
    if not isinstance(raw_order, str):
        return _fail("PARAM_ERROR", f"params.order must be a string, got {type(raw_order).__name__}", step_index)
    order = raw_order.strip().lower()
    if order not in ("", "asc", "desc"):
        return _fail("PARAM_ERROR", f"params.order must be 'asc', 'desc', or '' — got '{order}'", step_index)
    params["order"] = order

    # ── Layer 3: Column existence (warning only) ──────────────
    warnings: list[str] = []
    if dataset_columns and params["columns"]:
        ds_set = set(dataset_columns)
        missing = [c for c in params["columns"] if c not in ds_set]
        if missing:
            warnings.append(
                f"Step {step_index + 1} ({action}): column(s) not found in dataset: {missing}"
            )

    return {"valid": True, "step": {"action": action, "params": params}, "warnings": warnings}


def validate_ai_output(
    parsed: dict, dataset_columns: list[str] | None = None
) -> dict:
    """Validate raw AI output. Returns {steps, rejected, warnings}."""
    if not isinstance(parsed, dict) or not isinstance(parsed.get("steps"), list):
        return {
            "steps": [],
            "rejected": [{"raw": parsed, "reason": "AI output missing 'steps' array", "error_type": "SCHEMA_ERROR"}],
            "warnings": [],
        }
    steps, rejected, warnings = [], [], []
    for i, raw in enumerate(parsed["steps"]):
        result = validate_step(raw, dataset_columns, step_index=i)
        if result["valid"]:
            steps.append(result["step"])
            warnings.extend(result.get("warnings", []))
        else:
            rejected.append({"raw": raw, "reason": result["reason"], "error_type": result.get("error_type")})
    return {"steps": steps, "rejected": rejected, "warnings": warnings}


def validate_pipeline_steps(
    steps: list[dict], dataset_columns: list[str] | None = None
) -> dict:
    """
    Validate a list of already-normalised steps (from DB) before execution.
    Returns {has_hard_errors, errors, warnings}.
    """
    errors, warnings = [], []
    for i, step in enumerate(steps):
        result = validate_step(step, dataset_columns, step_index=i)
        if not result["valid"]:
            errors.append({
                "type": result.get("error_type", "VALIDATION_ERROR"),
                "message": result["reason"],
                "step": i,
            })
        else:
            warnings.extend(result.get("warnings", []))
    return {"has_hard_errors": bool(errors), "errors": errors, "warnings": warnings}


def detect_schema_mismatch(steps: list[dict], dataset_columns: list[str]) -> list[dict]:
    ds_set = set(dataset_columns)
    issues = []
    for i, step in enumerate(steps):
        cols = step.get("params", {}).get("columns", [])
        missing = [c for c in cols if c not in ds_set]
        if missing:
            issues.append({"step_index": i, "action": step["action"], "missing_cols": missing})
    return issues


# ── Helpers ───────────────────────────────────────────────────
def _fail(error_type: str, reason: str, step_index: int) -> dict:
    return {"valid": False, "reason": reason, "error_type": error_type, "step": step_index}

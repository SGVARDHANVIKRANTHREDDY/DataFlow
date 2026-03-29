"""Unit tests for the 3-layer validator."""
import pytest
from app.services.validator import validate_step, validate_ai_output, detect_schema_mismatch

pytestmark = pytest.mark.asyncio

COLS = ["age", "salary", "city"]


def test_valid_step_passes():
    raw = {"action": "drop_nulls", "params": {"columns": [], "method": "", "threshold": None, "order": ""}}
    r = validate_step(raw, COLS)
    assert r["valid"] is True
    assert r["step"]["action"] == "drop_nulls"


def test_unknown_action_rejected():
    raw = {"action": "fly_to_moon", "params": {}}
    r = validate_step(raw)
    assert r["valid"] is False
    assert r["error_type"] == "UNKNOWN_ACTION"


def test_extra_param_key_rejected():
    raw = {"action": "normalize", "params": {"evil_param": "hack"}}
    r = validate_step(raw)
    assert r["valid"] is False
    assert "Unknown param keys" in r["reason"]


def test_wrong_columns_type_rejected():
    raw = {"action": "normalize", "params": {"columns": "age"}}
    r = validate_step(raw)
    assert r["valid"] is False


def test_invalid_order_soft_reset():
    raw = {"action": "sort_values", "params": {"columns": [], "method": "", "threshold": None, "order": "sideways"}}
    r = validate_step(raw)
    assert r["valid"] is False  # "sideways" is not asc/desc/""


def test_valid_order_asc():
    raw = {"action": "sort_values", "params": {"columns": [], "method": "", "threshold": None, "order": "asc"}}
    r = validate_step(raw)
    assert r["valid"] is True
    assert r["step"]["params"]["order"] == "asc"


def test_missing_column_warning_not_error():
    raw = {"action": "normalize", "params": {"columns": ["nonexistent"], "method": "", "threshold": None, "order": ""}}
    r = validate_step(raw, COLS)
    assert r["valid"] is True
    assert len(r["warnings"]) > 0
    assert "nonexistent" in r["warnings"][0]


def test_ai_output_validation():
    ai_output = {
        "steps": [
            {"action": "drop_nulls", "params": {"columns": [], "method": "", "threshold": None, "order": ""}},
            {"action": "BAD_ACTION", "params": {}},
            {"action": "normalize", "params": {"columns": [], "method": "", "threshold": None, "order": ""}},
        ]
    }
    result = validate_ai_output(ai_output, COLS)
    assert len(result["steps"]) == 2
    assert len(result["rejected"]) == 1
    assert result["rejected"][0]["error_type"] == "UNKNOWN_ACTION"


def test_ai_output_missing_steps_array():
    result = validate_ai_output({"not_steps": []}, COLS)
    assert len(result["steps"]) == 0
    assert len(result["rejected"]) == 1


def test_schema_mismatch_detection():
    steps = [
        {"action": "normalize", "params": {"columns": ["age", "ghost_col"], "method": "", "threshold": None, "order": ""}},
        {"action": "drop_nulls", "params": {"columns": [], "method": "", "threshold": None, "order": ""}},
    ]
    issues = detect_schema_mismatch(steps, ["age", "salary"])
    assert len(issues) == 1
    assert "ghost_col" in issues[0]["missing_cols"]
    assert issues[0]["step_index"] == 0


def test_threshold_out_of_range_rejected():
    raw = {"action": "filter_rows", "params": {"columns": ["age"], "method": "gt", "threshold": 1e15, "order": ""}}
    r = validate_step(raw)
    assert r["valid"] is False
    assert "out of safe range" in r["reason"]

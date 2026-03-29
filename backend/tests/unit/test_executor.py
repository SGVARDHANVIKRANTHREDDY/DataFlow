"""Unit tests for the pipeline executor — partial results, error isolation."""
import pytest
import pandas as pd
from app.services.executor import execute_pipeline


@pytest.fixture
def clean_df():
    return pd.DataFrame({
        "age":    [25.0, 30.0, 45.0],
        "salary": [50000.0, 60000.0, 80000.0],
        "dept":   ["Eng", "Mkt", "HR"],
    })


class TestExecutor:
    def test_success_status(self, clean_df):
        steps = [{"action": "drop_nulls", "params": {"columns": []}}]
        report, result = execute_pipeline(steps, clean_df)
        assert report["status"] == "success"
        assert report["steps_ok"] == 1
        assert report["steps_failed"] == 0
        assert isinstance(result, pd.DataFrame)

    def test_full_pipeline(self, clean_df):
        steps = [
            {"action": "normalize",    "params": {"columns": ["age", "salary"]}},
            {"action": "standardize",  "params": {"columns": []}},
            {"action": "remove_duplicates", "params": {"columns": []}},
        ]
        report, result = execute_pipeline(steps, clean_df)
        assert report["status"] == "success"
        assert report["steps_total"] == 3
        assert report["steps_ok"] == 3

    def test_partial_execution_on_bad_step(self, clean_df):
        """A bad step should fail gracefully, pipeline continues."""
        steps = [
            {"action": "normalize", "params": {"columns": ["age"]}},
            {"action": "nonexistent_action", "params": {}},  # bad step
            {"action": "sort_values", "params": {"columns": ["salary"], "order": "asc"}},
        ]
        report, result = execute_pipeline(steps, clean_df)
        assert report["status"] == "partial"
        assert report["steps_ok"] == 2
        assert report["steps_failed"] == 1
        assert isinstance(result, pd.DataFrame)
        assert len(result) == len(clean_df)

    def test_all_steps_fail_is_failure(self, clean_df):
        steps = [
            {"action": "does_not_exist_1", "params": {}},
            {"action": "does_not_exist_2", "params": {}},
        ]
        report, result = execute_pipeline(steps, clean_df)
        assert report["status"] == "failure"
        assert report["steps_ok"] == 0
        # Should return original df on total failure
        assert len(result) == len(clean_df)

    def test_empty_steps(self, clean_df):
        report, result = execute_pipeline([], clean_df)
        assert report["status"] == "success"
        pd.testing.assert_frame_equal(result, clean_df)

    def test_never_mutates_input(self, clean_df):
        original = clean_df.copy()
        steps = [{"action": "normalize", "params": {"columns": ["age"]}}]
        execute_pipeline(steps, clean_df)
        pd.testing.assert_frame_equal(clean_df, original)

    def test_report_has_per_step_timing(self, clean_df):
        steps = [{"action": "normalize", "params": {}}]
        report, _ = execute_pipeline(steps, clean_df)
        assert len(report["log"]) == 1
        assert report["log"][0]["ms"] >= 0
        assert report["log"][0]["status"] == "ok"

    def test_deterministic_output(self, clean_df):
        steps = [
            {"action": "fill_nulls",       "params": {"columns": [], "method": "mean"}},
            {"action": "normalize",        "params": {"columns": ["age"]}},
            {"action": "remove_duplicates","params": {"columns": []}},
        ]
        _, r1 = execute_pipeline(steps, clean_df)
        _, r2 = execute_pipeline(steps, clean_df)
        pd.testing.assert_frame_equal(r1, r2)

    def test_row_counts_tracked(self):
        df = pd.DataFrame({"x": [1, 2, None, 4, None]})
        steps = [{"action": "drop_nulls", "params": {"columns": []}}]
        report, result = execute_pipeline(steps, df)
        assert report["input_count"] == 5
        assert report["output_count"] == 3
        assert report["log"][0]["rows_before"] == 5
        assert report["log"][0]["rows_after"] == 3
        assert report["log"][0]["delta"] == -2

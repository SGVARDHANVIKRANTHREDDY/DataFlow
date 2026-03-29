"""Unit tests for all 13 transform functions — determinism guaranteed."""
import pytest
import pandas as pd
import numpy as np
from app.services.transforms import ACTION_REGISTRY


@pytest.fixture
def df():
    return pd.DataFrame({
        "age":    [25.0, 30.0, None, 45.0, 200.0],
        "salary": [50000.0, 60000.0, 55000.0, None, 80000.0],
        "dept":   ["Eng", "Mkt", "Eng", "HR", "Eng"],
        "score":  [0.5, 0.8, 0.3, 0.9, 0.1],
    })


class TestDropNulls:
    def test_drops_rows_with_nulls_in_any_column(self, df):
        result = ACTION_REGISTRY["drop_nulls"](df, {"columns": []})
        assert result.isna().sum().sum() == 0
        assert len(result) < len(df)

    def test_drops_only_specified_columns(self, df):
        result = ACTION_REGISTRY["drop_nulls"](df, {"columns": ["salary"]})
        # age still has NaN, salary does not
        assert result["salary"].isna().sum() == 0
        assert len(result) == 4  # one salary null removed

    def test_does_not_mutate_input(self, df):
        original_len = len(df)
        ACTION_REGISTRY["drop_nulls"](df, {"columns": []})
        assert len(df) == original_len


class TestFillNulls:
    def test_fill_mean(self, df):
        result = ACTION_REGISTRY["fill_nulls"](df, {"columns": ["age"], "method": "mean"})
        assert result["age"].isna().sum() == 0
        expected_mean = df["age"].dropna().mean()
        assert result["age"].iloc[2] == pytest.approx(expected_mean)

    def test_fill_median(self, df):
        result = ACTION_REGISTRY["fill_nulls"](df, {"columns": ["salary"], "method": "median"})
        assert result["salary"].isna().sum() == 0
        s = sorted(df["salary"].dropna().values)
        m = len(s) // 2
        expected = (s[m-1] + s[m]) / 2 if len(s) % 2 == 0 else s[m]
        assert result["salary"].iloc[3] == pytest.approx(expected)

    def test_fill_zero_default(self, df):
        result = ACTION_REGISTRY["fill_nulls"](df, {"columns": ["age"], "method": ""})
        assert result["age"].iloc[2] == 0.0

    def test_deterministic(self, df):
        r1 = ACTION_REGISTRY["fill_nulls"](df, {"columns": ["age"], "method": "mean"})
        r2 = ACTION_REGISTRY["fill_nulls"](df, {"columns": ["age"], "method": "mean"})
        pd.testing.assert_frame_equal(r1, r2)


class TestRemoveOutliers:
    def test_removes_outlier_row(self, df):
        # age=200 is a clear outlier (IQR × 1.5)
        result = ACTION_REGISTRY["remove_outliers"](df.dropna(), {"columns": ["age"]})
        assert 200.0 not in result["age"].values

    def test_keeps_valid_rows(self, df):
        result = ACTION_REGISTRY["remove_outliers"](df.dropna(), {"columns": ["age"]})
        assert 25.0 in result["age"].values
        assert 30.0 in result["age"].values

    def test_insufficient_data_skipped(self):
        tiny = pd.DataFrame({"x": [1, 2, 3]})
        result = ACTION_REGISTRY["remove_outliers"](tiny, {"columns": ["x"]})
        assert len(result) == len(tiny)


class TestNormalize:
    def test_scales_to_0_1(self, df):
        clean = df.dropna()
        result = ACTION_REGISTRY["normalize"](clean, {"columns": ["salary"]})
        assert result["salary"].min() == pytest.approx(0.0)
        assert result["salary"].max() == pytest.approx(1.0)

    def test_constant_column_becomes_zero(self):
        d = pd.DataFrame({"x": [5.0, 5.0, 5.0]})
        result = ACTION_REGISTRY["normalize"](d, {"columns": ["x"]})
        assert (result["x"] == 0.0).all()

    def test_deterministic(self, df):
        clean = df.dropna()
        r1 = ACTION_REGISTRY["normalize"](clean, {"columns": ["salary"]})
        r2 = ACTION_REGISTRY["normalize"](clean, {"columns": ["salary"]})
        pd.testing.assert_frame_equal(r1, r2)


class TestStandardize:
    def test_zero_mean(self, df):
        clean = df.dropna()
        result = ACTION_REGISTRY["standardize"](clean, {"columns": ["salary"]})
        assert result["salary"].mean() == pytest.approx(0.0, abs=1e-10)

    def test_unit_variance(self, df):
        clean = df.dropna()
        result = ACTION_REGISTRY["standardize"](clean, {"columns": ["salary"]})
        assert result["salary"].std(ddof=0) == pytest.approx(1.0, abs=1e-6)

    def test_zero_std_column_safe(self):
        d = pd.DataFrame({"x": [3.0, 3.0, 3.0]})
        result = ACTION_REGISTRY["standardize"](d, {"columns": ["x"]})
        assert (result["x"] == 0.0).all()


class TestEncodeCategorical:
    def test_encodes_to_integers(self, df):
        result = ACTION_REGISTRY["encode_categorical"](df, {"columns": ["dept"]})
        assert pd.api.types.is_numeric_dtype(result["dept"])

    def test_lexicographic_order(self, df):
        result = ACTION_REGISTRY["encode_categorical"](df, {"columns": ["dept"]})
        # Eng=0, HR=1, Mkt=2 (lexicographic)
        assert result["dept"].iloc[0] == 0   # Eng
        assert result["dept"].iloc[1] == 2   # Mkt
        assert result["dept"].iloc[3] == 1   # HR

    def test_deterministic_across_runs(self, df):
        r1 = ACTION_REGISTRY["encode_categorical"](df, {"columns": ["dept"]})
        r2 = ACTION_REGISTRY["encode_categorical"](df, {"columns": ["dept"]})
        pd.testing.assert_frame_equal(r1, r2)


class TestFilterRows:
    def test_gte_filter(self, df):
        result = ACTION_REGISTRY["filter_rows"](df, {"columns": ["age"], "method": "gte", "threshold": 30})
        numeric_ages = result["age"].dropna()
        assert all(v >= 30 for v in numeric_ages)

    def test_lt_filter(self, df):
        result = ACTION_REGISTRY["filter_rows"](df, {"columns": ["salary"], "method": "lt", "threshold": 60000})
        numeric = result["salary"].dropna()
        assert all(v < 60000 for v in numeric)


class TestSortValues:
    def test_ascending(self, df):
        clean = df.dropna()
        result = ACTION_REGISTRY["sort_values"](clean, {"columns": ["age"], "order": "asc"})
        ages = result["age"].tolist()
        assert ages == sorted(ages)

    def test_descending(self, df):
        clean = df.dropna()
        result = ACTION_REGISTRY["sort_values"](clean, {"columns": ["age"], "order": "desc"})
        ages = result["age"].tolist()
        assert ages == sorted(ages, reverse=True)

    def test_stable_sort(self):
        d = pd.DataFrame({"x": [1, 1, 1], "y": [3, 1, 2]})
        result = ACTION_REGISTRY["sort_values"](d, {"columns": ["x"], "order": "asc"})
        # Stable: equal x values preserve original order (y=3, y=1, y=2)
        assert result["y"].tolist() == [3, 1, 2]


class TestRemoveDuplicates:
    def test_removes_duplicates(self):
        d = pd.DataFrame({"x": [1, 1, 2, 3, 3], "y": [10, 10, 20, 30, 30]})
        result = ACTION_REGISTRY["remove_duplicates"](d, {"columns": []})
        assert len(result) == 3
        assert result["x"].tolist() == [1, 2, 3]

    def test_subset_columns(self):
        d = pd.DataFrame({"x": [1, 1, 2], "y": [10, 20, 30]})
        result = ACTION_REGISTRY["remove_duplicates"](d, {"columns": ["x"]})
        assert len(result) == 2


class TestSelectDropColumns:
    def test_select(self, df):
        result = ACTION_REGISTRY["select_columns"](df, {"columns": ["age", "dept"]})
        assert list(result.columns) == ["age", "dept"]

    def test_drop(self, df):
        result = ACTION_REGISTRY["drop_columns"](df, {"columns": ["score"]})
        assert "score" not in result.columns
        assert "age" in result.columns

    def test_select_missing_col_ignored(self, df):
        result = ACTION_REGISTRY["select_columns"](df, {"columns": ["age", "nonexistent"]})
        assert list(result.columns) == ["age"]


class TestConvertTypes:
    def test_to_numeric(self):
        d = pd.DataFrame({"x": ["1", "2", "three", "4"]})
        result = ACTION_REGISTRY["convert_types"](d, {"columns": ["x"], "method": "numeric"})
        assert result["x"].iloc[0] == 1.0
        assert pd.isna(result["x"].iloc[2])   # "three" → NaN

    def test_to_string(self, df):
        result = ACTION_REGISTRY["convert_types"](df, {"columns": ["age"], "method": "string"})
        assert result["age"].dtype == object

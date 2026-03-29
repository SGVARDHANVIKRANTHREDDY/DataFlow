"""
Security tests for the CSV sanitization layer.
These tests verify protection against:
  - CSV injection (formula injection attack)
  - Magic bytes spoofing (disguised executables)
  - Encoding attacks
  - Column name injection
  - Null byte injection
  - Oversized files/data
"""
import pytest
import io
import pandas as pd
from app.services.sanitizer import (
    validate_upload, sanitize_dataframe, sanitize_pipeline_name,
    safe_column_reference, SanitizationError
)


class TestFileValidation:
    """Test upload-time file validation."""

    def test_rejects_empty_file(self):
        with pytest.raises(SanitizationError) as exc:
            validate_upload(b"", "empty.csv")
        assert exc.value.error_type == "EMPTY_FILE"

    def test_accepts_valid_csv(self):
        content = b"name,age\nAlice,30\nBob,25\n"
        validate_upload(content, "data.csv")   # no exception

    def test_rejects_wrong_extension(self):
        with pytest.raises(SanitizationError) as exc:
            validate_upload(b"name,age\n", "data.xlsx")
        assert exc.value.error_type == "INVALID_EXTENSION"

    def test_rejects_exe_disguised_as_csv(self):
        """MZ header = Windows executable — must reject even with .csv extension."""
        content = b"\x4D\x5A\x90\x00" + b"A" * 100
        with pytest.raises(SanitizationError) as exc:
            validate_upload(content, "report.csv")
        assert exc.value.error_type == "MAGIC_BYTES_MISMATCH"

    def test_rejects_pdf_disguised_as_csv(self):
        content = b"\x25\x50\x44\x46\x2D\x31\x2E" + b"some pdf content"
        with pytest.raises(SanitizationError) as exc:
            validate_upload(content, "data.csv")
        assert exc.value.error_type == "MAGIC_BYTES_MISMATCH"

    def test_rejects_png_disguised_as_csv(self):
        content = b"\x89\x50\x4E\x47\x0D\x0A\x1A\x0A" + b"image data"
        with pytest.raises(SanitizationError) as exc:
            validate_upload(content, "data.csv")
        assert exc.value.error_type == "MAGIC_BYTES_MISMATCH"

    def test_rejects_null_bytes(self):
        content = b"name,age\x00\nAlice,30\n"
        with pytest.raises(SanitizationError) as exc:
            validate_upload(content, "data.csv")
        assert exc.value.error_type == "NULL_BYTES_DETECTED"

    def test_rejects_oversized_file(self, monkeypatch):
        from app.config import get_settings
        monkeypatch.setattr(get_settings(), "MAX_UPLOAD_SIZE_MB", 0.0001)
        with pytest.raises(SanitizationError) as exc:
            validate_upload(b"A" * 1000, "data.csv")
        assert exc.value.error_type == "FILE_TOO_LARGE"

    def test_accepts_latin1_encoding(self):
        content = "name,city\nJosé,Málaga\n".encode("latin-1")
        validate_upload(content, "data.csv")   # should not raise


class TestCSVInjectionProtection:
    """Test CSV injection (formula injection) protection."""

    def make_df(self, data: dict) -> pd.DataFrame:
        return pd.DataFrame(data)

    def test_neutralizes_equals_prefix(self):
        """=CMD("...") is the classic CSV injection attack."""
        df = self.make_df({"name": ["=CMD(\"rm -rf /\")", "Alice"]})
        result, warnings = sanitize_dataframe(df)
        assert result["name"].iloc[0].startswith("'=")
        assert len(warnings) > 0
        assert any("injection" in w.lower() for w in warnings)

    def test_neutralizes_plus_prefix(self):
        """+ is also a formula trigger in some spreadsheets."""
        df = self.make_df({"formula": ["+SUM(1,2)", "normal"]})
        result, _ = sanitize_dataframe(df)
        assert result["formula"].iloc[0].startswith("'+")

    def test_neutralizes_minus_prefix(self):
        df = self.make_df({"val": ["-SUM(A1:A10)", "normal"]})
        result, _ = sanitize_dataframe(df)
        assert result["val"].iloc[0].startswith("'-")

    def test_neutralizes_at_prefix(self):
        """@ triggers DDE (Dynamic Data Exchange) attacks."""
        df = self.make_df({"col": ["@SUM(1+1)*cmd|'/c calc'!A0", "safe"]})
        result, _ = sanitize_dataframe(df)
        assert result["col"].iloc[0].startswith("'@")

    def test_neutralizes_tab_prefix(self):
        """Tab character can be used to trigger formulas."""
        df = self.make_df({"col": ["\t=SUM(1)", "safe"]})
        result, _ = sanitize_dataframe(df)
        assert result["col"].iloc[0].startswith("'")

    def test_preserves_normal_strings(self):
        """Normal values must pass through unchanged."""
        df = self.make_df({"name": ["Alice", "Bob", "Charlie 123"]})
        result, warnings = sanitize_dataframe(df)
        assert result["name"].tolist() == ["Alice", "Bob", "Charlie 123"]
        assert not any("injection" in w.lower() for w in warnings)

    def test_preserves_numeric_columns(self):
        """Numeric columns are not processed for injection."""
        df = self.make_df({"age": [25, 30, 45], "salary": [50000.0, 60000.0, 80000.0]})
        result, warnings = sanitize_dataframe(df)
        assert result["age"].tolist() == [25, 30, 45]
        assert not any("injection" in w.lower() for w in warnings)

    def test_multiple_injection_cells(self):
        """All injection cells in a column are neutralized."""
        df = self.make_df({"cmd": ["=EXEC(1)", "=DROP()", "=EVIL()", "safe"]})
        result, warnings = sanitize_dataframe(df)
        for i in range(3):
            assert result["cmd"].iloc[i].startswith("'=")
        assert result["cmd"].iloc[3] == "safe"
        assert "3" in "".join(warnings)  # 3 cells neutralized

    def test_null_bytes_in_cells_removed(self):
        """Null bytes in cell values are stripped."""
        df = self.make_df({"data": ["normal\x00value", "clean"]})
        result, warnings = sanitize_dataframe(df)
        assert "\x00" not in result["data"].iloc[0]
        assert any("null" in w.lower() for w in warnings)


class TestColumnNameSanitization:
    """Test column name sanitization."""

    def test_strips_whitespace(self):
        df = pd.DataFrame({" name ": [1], "  age  ": [2]})
        result, _ = sanitize_dataframe(df)
        assert "name" in result.columns
        assert "age" in result.columns

    def test_removes_control_characters(self):
        df = pd.DataFrame({"col\x00name": [1], "normal": [2]})
        result, _ = sanitize_dataframe(df)
        # null byte removed from column name
        assert not any("\x00" in col for col in result.columns)

    def test_deduplicates_column_names(self):
        # Duplicate columns not directly testable via DataFrame constructor,
        # but test the internal function
        from app.services.sanitizer import _sanitize_column_names
        cols, warnings = _sanitize_column_names(["name", "name", "name"])
        assert cols[0] == "name"
        assert cols[1] == "name_1"
        assert cols[2] == "name_2"
        assert len(warnings) == 2

    def test_empty_column_name_replaced(self):
        from app.services.sanitizer import _sanitize_column_names
        cols, warnings = _sanitize_column_names(["", "normal"])
        assert cols[0] == "column_0"
        assert len(warnings) == 1


class TestColumnReferenceValidation:
    """Test safe_column_reference — prevents injection via pipeline step params."""

    def test_accepts_valid_column_name(self):
        result = safe_column_reference("salary")
        assert result == "salary"

    def test_accepts_column_with_spaces(self):
        result = safe_column_reference("  first name  ")
        assert result == "first name"

    def test_rejects_empty_column(self):
        with pytest.raises(SanitizationError) as exc:
            safe_column_reference("")
        assert exc.value.error_type == "INVALID_COLUMN"

    def test_rejects_sql_injection_pattern(self):
        with pytest.raises(SanitizationError):
            safe_column_reference("name; DROP TABLE users--")

    def test_rejects_exec_pattern(self):
        with pytest.raises(SanitizationError):
            safe_column_reference("col exec(cmd)")


class TestPipelineNameSanitization:
    def test_strips_control_chars(self):
        result = sanitize_pipeline_name("My\x00Pipeline\x01")
        assert "\x00" not in result
        assert "\x01" not in result

    def test_truncates_long_names(self):
        result = sanitize_pipeline_name("A" * 500)
        assert len(result) <= 200

    def test_preserves_normal_name(self):
        result = sanitize_pipeline_name("My Sales Cleaning Pipeline")
        assert result == "My Sales Cleaning Pipeline"

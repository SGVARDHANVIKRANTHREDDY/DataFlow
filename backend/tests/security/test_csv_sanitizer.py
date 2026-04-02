import pytest
import asyncio
from unittest.mock import patch, MagicMock
from app.services.security.csv_sanitizer import validate_and_sanitize_csv, SecurityError

def test_csv_injection_sanitization():
    """
    FAANG Requirement: Enforce strict defense against CSV injection (Formula Injection).
    Validates that formulas starting with =, +, -, @, or tab are neutralized.
    """
    malicious_csv = (
        "id,name,value\n"
        "1,=cmd|' /C calc'!A0,100\n"
        "2,+SUM(A1:A10),200\n"
        "3,-1+2,300\n"
        "4,@1+2,400\n"
        "5,\t=cmd|' /C notepad'!A0,500\n"
        "6,normal syntax,600\n"
    ).encode("utf-8")

    result = validate_and_sanitize_csv(malicious_csv)
    
    # Asserting that cells were sanitized
    assert result.cells_sanitized == 5, f"Expected 5 sanitized cells, got {result.cells_sanitized}"
    
    # Verify the actual DataFrame output has neutralization ticks
    df = result.df
    assert df.iloc[0]["name"].startswith("'="), "Failed to sanitize '=' injection"
    assert df.iloc[1]["name"].startswith("'+"), "Failed to sanitize '+' injection"
    assert df.iloc[2]["name"].startswith("'-"), "Failed to sanitize '-' injection"
    assert df.iloc[3]["name"].startswith("'@"), "Failed to sanitize '@' injection"
    assert df.iloc[4]["name"].startswith("'\t"), "Failed to sanitize tab injection"
    assert df.iloc[5]["name"] == "normal syntax", "Normal syntax should be untouched"

def test_csv_size_guardrails():
    """
    FAANG Requirement: Strict limits on payload sizes (rows, cols, cell lengths)
    to prevent memory/CPU exhaustion.
    """
    # Over max columns
    header = ",".join([f"col{i}" for i in range(1005)])
    row = ",".join(["1" for _ in range(1005)])
    over_cols_csv = f"{header}\n{row}".encode("utf-8")
    
    with pytest.raises(SecurityError, match="exceeds maximum allowed columns"):
        validate_and_sanitize_csv(over_cols_csv, max_columns=1000)

    # Over cell length limit
    long_cell = "A" * 10001
    over_len_csv = f"id,val\n1,{long_cell}".encode("utf-8")
    with pytest.raises(SecurityError, match="exceeds physical cell limits"):
        # Assuming the validator enforces cell size limits
        validate_and_sanitize_csv(over_len_csv, max_cell_length=10000)

    # Over max rows
    rows_csv = "id,val\n" + "\n".join(["1,a" for _ in range(100)])
    with pytest.raises(SecurityError, match="exceeds maximum allowed rows"):
        validate_and_sanitize_csv(rows_csv.encode("utf-8"), max_rows=50)

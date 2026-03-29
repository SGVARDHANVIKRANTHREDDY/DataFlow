import pytest
from httpx import AsyncClient
import io

@pytest.mark.asyncio
async def test_upload_empty_csv(auth_client: AsyncClient):
    """Test uploading an empty CSV file."""
    files = {"file": ("empty.csv", b"", "text/csv")}
    response = await auth_client.post("/datasets/upload", files=files)
    # Should either fail with 400 or handle as 0 rows
    assert response.status_code in [400, 201]
    if response.status_code == 201:
        assert response.json()["row_count"] == 0

@pytest.mark.asyncio
async def test_fork_pipeline_success(auth_client: AsyncClient, sample_pipeline):
    """Test forking an existing pipeline."""
    pid = sample_pipeline["id"]
    response = await auth_client.post(f"/pipelines/{pid}/fork")
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == f"{sample_pipeline['name']} (Fork)"
    assert data["steps"] == sample_pipeline["steps"]
    assert data["id"] != pid

@pytest.mark.asyncio
async def test_fork_nonexistent_pipeline(auth_client: AsyncClient):
    """Test forking a pipeline that doesn't exist."""
    response = await auth_client.post("/pipelines/999999/fork")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_execute_pipeline_invalid_schema(auth_client: AsyncClient, sample_pipeline, sample_dataset):
    """Test executing a pipeline on a dataset missing required columns (if logic exists)."""
    # Create a pipeline that expects 'Salary' but dataset only has 'Name', 'Age'
    # This depends on your engine's validation logic.
    pass

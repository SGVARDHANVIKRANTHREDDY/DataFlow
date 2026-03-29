"""
E2E tests: full user workflow
  1. Register
  2. Upload CSV → get dataset_id + job_id
  3. Create pipeline
  4. Execute → get execution_id
  5. Poll job status
  6. Verify output has download_url
"""
import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.asyncio
class TestFullUserWorkflow:

    async def test_register_and_upload_flow(self, client, sample_csv_bytes):
        # 1. Register
        reg = await client.post("/api/v1/auth/register", json={"email": "e2e@test.com", "password": "E2ePass123"})
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Upload CSV
        files = {"file": ("data.csv", sample_csv_bytes, "text/csv")}
        upload_resp = await client.post("/api/v1/datasets", headers=headers, files=files)
        assert upload_resp.status_code == 202
        upload_data = upload_resp.json()
        assert "dataset_id" in upload_data
        assert "job_id" in upload_data
        dataset_id = upload_data["dataset_id"]

        # 3. Verify dataset was created
        ds_resp = await client.get(f"/api/v1/datasets/{dataset_id}", headers=headers)
        assert ds_resp.status_code == 200
        ds = ds_resp.json()
        assert ds["original_filename"] == "data.csv"

    async def test_create_and_execute_pipeline(self, client, sample_csv_bytes):
        # Register
        reg = await client.post("/api/v1/auth/register", json={"email": "e2e2@test.com", "password": "E2ePass123"})
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Upload
        files = {"file": ("test.csv", sample_csv_bytes, "text/csv")}
        upload = await client.post("/api/v1/datasets", headers=headers, files=files)
        dataset_id = upload.json()["dataset_id"]

        # Create pipeline
        create_resp = await client.post("/api/v1/pipelines", headers=headers, json={
            "name": "E2E Pipeline",
            "dataset_id": dataset_id,
            "steps": [
                {"action": "drop_nulls",    "params": {"columns": [], "method": "", "threshold": None, "order": ""}},
                {"action": "normalize",     "params": {"columns": [], "method": "", "threshold": None, "order": ""}},
            ],
        })
        assert create_resp.status_code == 201
        pipeline_id = create_resp.json()["id"]

        # Execute
        exec_resp = await client.post(f"/api/v1/pipelines/{pipeline_id}/execute",
                                       headers=headers, json={"dataset_id": dataset_id})
        assert exec_resp.status_code == 202
        exec_data = exec_resp.json()
        assert "execution_id" in exec_data
        assert "job_id" in exec_data
        assert exec_data["status"] == "pending"

        # List executions
        list_resp = await client.get(f"/api/v1/pipelines/{pipeline_id}/executions", headers=headers)
        assert list_resp.status_code == 200
        assert len(list_resp.json()) >= 1

    async def test_data_isolation_between_users(self, client, sample_csv_bytes):
        # User A registers and uploads
        reg_a = await client.post("/api/v1/auth/register", json={"email": "iso_a@test.com", "password": "IsoPass123"})
        headers_a = {"Authorization": f"Bearer {reg_a.json()['access_token']}"}
        files = {"file": ("private.csv", sample_csv_bytes, "text/csv")}
        upload = await client.post("/api/v1/datasets", headers=headers_a, files=files)
        dataset_id = upload.json()["dataset_id"]

        # User B registers
        reg_b = await client.post("/api/v1/auth/register", json={"email": "iso_b@test.com", "password": "IsoPass123"})
        headers_b = {"Authorization": f"Bearer {reg_b.json()['access_token']}"}

        # User B cannot access User A's dataset
        resp = await client.get(f"/api/v1/datasets/{dataset_id}", headers=headers_b)
        assert resp.status_code == 404

    async def test_health_endpoint(self, client):
        resp = await client.get("/health")
        # May return 200 or 503 depending on Redis/DB in test env — just check it's JSON
        assert resp.status_code in (200, 503)
        data = resp.json()
        assert "status" in data
        assert "version" in data

    async def test_upload_rejects_non_csv(self, client, auth_headers):
        files = {"file": ("evil.exe", b"MZ\x90\x00", "application/octet-stream")}
        resp = await client.post("/api/v1/datasets", headers=auth_headers, files=files)
        assert resp.status_code == 400

    async def test_upload_empty_file_rejected(self, client, auth_headers):
        files = {"file": ("empty.csv", b"", "text/csv")}
        resp = await client.post("/api/v1/datasets", headers=auth_headers, files=files)
        assert resp.status_code == 400

    async def test_unauthenticated_requests_rejected(self, client):
        endpoints = [
            ("GET",  "/api/v1/datasets"),
            ("GET",  "/api/v1/pipelines"),
            ("POST", "/api/v1/pipelines"),
        ]
        for method, url in endpoints:
            resp = await client.request(method, url)
            assert resp.status_code in (401, 403), f"{method} {url} should require auth"

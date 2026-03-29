"""Tests for idempotency middleware — prevents duplicate executions."""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


class TestIdempotencyKeyValidation:
    from app.middleware.idempotency import _is_valid_idempotency_key

    def test_accepts_uuid_v4(self):
        from app.middleware.idempotency import _is_valid_idempotency_key
        assert _is_valid_idempotency_key("550e8400-e29b-41d4-a716-446655440000")

    def test_accepts_opaque_token(self):
        from app.middleware.idempotency import _is_valid_idempotency_key
        assert _is_valid_idempotency_key("my-idempotency-key-12345678")

    def test_rejects_short_key(self):
        from app.middleware.idempotency import _is_valid_idempotency_key
        assert not _is_valid_idempotency_key("abc")

    def test_rejects_sql_injection(self):
        from app.middleware.idempotency import _is_valid_idempotency_key
        assert not _is_valid_idempotency_key("key'; DROP TABLE users--")

    def test_rejects_empty_key(self):
        from app.middleware.idempotency import _is_valid_idempotency_key
        assert not _is_valid_idempotency_key("")

    def test_rejects_special_chars(self):
        from app.middleware.idempotency import _is_valid_idempotency_key
        assert not _is_valid_idempotency_key("key<script>alert(1)</script>")


@pytest.mark.asyncio
class TestIdempotencyFlow:
    """Integration tests for idempotency cache flow."""

    async def test_second_request_with_same_key_returns_cached(self, client, auth_headers):
        """
        Two POST requests with the same idempotency key must produce the same response.
        Only the first actually executes; the second returns the cached response.
        """
        idempotency_key = "550e8400-e29b-41d4-a716-446655440001"
        headers = {**auth_headers, "X-Idempotency-Key": idempotency_key}

        # First request — creates the pipeline
        resp1 = await client.post("/api/v1/pipelines", headers=headers,
                                   json={"name": "Idempotent Pipeline", "steps": []})
        assert resp1.status_code == 201
        body1 = resp1.json()

        # Second request with same key — must return identical response
        resp2 = await client.post("/api/v1/pipelines", headers=headers,
                                   json={"name": "Idempotent Pipeline", "steps": []})
        assert resp2.status_code == 201
        body2 = resp2.json()

        # Same pipeline ID (not duplicated)
        assert body1["id"] == body2["id"]
        # Cache hit header
        assert resp2.headers.get("X-Idempotency-Status") == "HIT"

    async def test_different_keys_create_different_resources(self, client, auth_headers):
        """Different idempotency keys must produce different resources."""
        h1 = {**auth_headers, "X-Idempotency-Key": "key-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
        h2 = {**auth_headers, "X-Idempotency-Key": "key-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}

        resp1 = await client.post("/api/v1/pipelines", headers=h1, json={"name": "Pipeline A", "steps": []})
        resp2 = await client.post("/api/v1/pipelines", headers=h2, json={"name": "Pipeline B", "steps": []})

        assert resp1.json()["id"] != resp2.json()["id"]

    async def test_invalid_idempotency_key_rejected(self, client, auth_headers):
        """Malformed idempotency key must be rejected with 400."""
        headers = {**auth_headers, "X-Idempotency-Key": "'; DROP TABLE pipelines--"}
        resp = await client.post("/api/v1/pipelines", headers=headers, json={"name": "Test", "steps": []})
        assert resp.status_code == 400
        assert "INVALID_IDEMPOTENCY_KEY" in resp.json()["error"]["type"]

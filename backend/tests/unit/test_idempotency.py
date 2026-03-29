"""Unit tests for idempotency key service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from app.services.security.idempotency import (
    hash_request_body, get_idempotency_key_from_request,
    check_idempotency, claim_idempotency_key, complete_idempotency_key,
)


class TestRequestBodyHashing:
    def test_same_body_same_hash(self):
        body = b'{"dataset_id": 1}'
        assert hash_request_body(body) == hash_request_body(body)

    def test_different_body_different_hash(self):
        assert hash_request_body(b"aaa") != hash_request_body(b"bbb")

    def test_hash_length_64(self):
        h = hash_request_body(b"test")
        assert len(h) == 64  # SHA-256 hex


class TestKeyExtraction:
    def test_valid_key_extracted(self):
        request = MagicMock()
        request.headers = {"Idempotency-Key": "my-unique-key-123"}
        key = get_idempotency_key_from_request(request)
        assert key == "my-unique-key-123"

    def test_missing_key_returns_none(self):
        request = MagicMock()
        request.headers = {}
        assert get_idempotency_key_from_request(request) is None

    def test_key_too_long_raises(self):
        request = MagicMock()
        request.headers = {"Idempotency-Key": "x" * 256}
        with pytest.raises(HTTPException) as exc_info:
            get_idempotency_key_from_request(request)
        assert exc_info.value.status_code == 400

    def test_empty_key_raises(self):
        request = MagicMock()
        request.headers = {"Idempotency-Key": "   "}
        with pytest.raises(HTTPException) as exc_info:
            get_idempotency_key_from_request(request)
        assert exc_info.value.status_code == 400

    def test_key_whitespace_stripped(self):
        request = MagicMock()
        request.headers = {"Idempotency-Key": "  my-key  "}
        key = get_idempotency_key_from_request(request)
        assert key == "my-key"


class TestIdempotencyBehavior:
    @pytest.mark.asyncio
    async def test_new_key_returns_none(self, db_session):
        """New key should return None — proceed with request."""
        result = await check_idempotency(
            db_session, user_id=1, key="brand-new-key",
            endpoint="/datasets", request_hash="abc123"
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_completed_key_returns_replay(self, db_session):
        """Completed key should return stored response."""
        from app.models import IdempotencyKey
        from datetime import timezone, timedelta
        UTC = timezone.utc

        record = IdempotencyKey(
            user_id=1, key="completed-key", endpoint="/pipelines",
            request_hash="hash123", processing=False,
            response_status=202, response_body={"execution_id": 42},
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db_session.add(record)
        await db_session.flush()

        result = await check_idempotency(
            db_session, user_id=1, key="completed-key",
            endpoint="/pipelines", request_hash="hash123"
        )
        assert result is not None
        assert result["replay"] is True
        assert result["body"]["execution_id"] == 42

    @pytest.mark.asyncio
    async def test_processing_key_raises_409(self, db_session):
        """In-flight key should return 409 Conflict."""
        from app.models import IdempotencyKey
        from datetime import timezone, timedelta
        UTC = timezone.utc

        record = IdempotencyKey(
            user_id=1, key="processing-key", endpoint="/pipelines",
            request_hash="hash123", processing=True,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db_session.add(record)
        await db_session.flush()

        with pytest.raises(HTTPException) as exc_info:
            await check_idempotency(
                db_session, user_id=1, key="processing-key",
                endpoint="/pipelines", request_hash="hash123"
            )
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_different_body_same_key_raises_422(self, db_session):
        """Same key with different request body = 422 (client bug)."""
        from app.models import IdempotencyKey
        from datetime import timezone, timedelta
        UTC = timezone.utc

        record = IdempotencyKey(
            user_id=1, key="body-conflict-key", endpoint="/pipelines",
            request_hash="original-hash", processing=False,
            response_status=202, response_body={"id": 1},
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db_session.add(record)
        await db_session.flush()

        with pytest.raises(HTTPException) as exc_info:
            await check_idempotency(
                db_session, user_id=1, key="body-conflict-key",
                endpoint="/pipelines", request_hash="different-hash"  # different!
            )
        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_expired_key_treated_as_new(self, db_session):
        """Expired key should behave like a new key."""
        from app.models import IdempotencyKey
        from datetime import timezone, timedelta
        UTC = timezone.utc

        record = IdempotencyKey(
            user_id=1, key="expired-key", endpoint="/pipelines",
            request_hash="hash123", processing=False,
            response_status=202, response_body={"id": 1},
            expires_at=datetime.now(UTC) - timedelta(hours=1),  # EXPIRED
        )
        db_session.add(record)
        await db_session.flush()

        result = await check_idempotency(
            db_session, user_id=1, key="expired-key",
            endpoint="/pipelines", request_hash="hash123"
        )
        assert result is None  # Expired = new key

    @pytest.mark.asyncio
    async def test_different_users_same_key_isolated(self, db_session):
        """Same key for different users should be independent."""
        from app.models import IdempotencyKey
        from datetime import timezone, timedelta
        UTC = timezone.utc

        record = IdempotencyKey(
            user_id=1, key="shared-key", endpoint="/pipelines",
            request_hash="hash123", processing=False,
            response_status=202, response_body={"id": 1},
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db_session.add(record)
        await db_session.flush()

        # User 2 using same key = new request (not replay)
        result = await check_idempotency(
            db_session, user_id=2, key="shared-key",   # different user!
            endpoint="/pipelines", request_hash="hash123"
        )
        assert result is None  # Independent for user 2

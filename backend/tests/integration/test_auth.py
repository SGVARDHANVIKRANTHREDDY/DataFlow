"""Integration tests for auth endpoints."""
import pytest


@pytest.mark.asyncio
class TestRegister:
    async def test_register_success(self, client):
        resp = await client.post("/api/v1/auth/register", json={"email": "new@test.com", "password": "Secure123"})
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_weak_password(self, client):
        resp = await client.post("/api/v1/auth/register", json={"email": "x@test.com", "password": "weak"})
        assert resp.status_code == 422

    async def test_register_duplicate_email(self, client):
        payload = {"email": "dup@test.com", "password": "Secure123"}
        await client.post("/api/v1/auth/register", json=payload)
        resp = await client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 400
        assert resp.json()["error"]["type"] == "HTTP_ERROR"

    async def test_register_invalid_email(self, client):
        resp = await client.post("/api/v1/auth/register", json={"email": "not-an-email", "password": "Secure123"})
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestLogin:
    async def test_login_success(self, client, test_user):
        resp = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "TestPass1"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_login_wrong_password(self, client, test_user):
        resp = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "WrongPass1"})
        assert resp.status_code == 401

    async def test_login_unknown_email(self, client):
        resp = await client.post("/api/v1/auth/login", json={"email": "nobody@test.com", "password": "Secure123"})
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestMe:
    async def test_me_authenticated(self, client, test_user, auth_headers):
        resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["email"] == "test@example.com"

    async def test_me_unauthenticated(self, client):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 403   # missing bearer

    async def test_me_invalid_token(self, client):
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"})
        assert resp.status_code == 401

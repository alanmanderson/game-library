from unittest.mock import patch

import bcrypt
from jose import jwt
from sqlalchemy import select

from app.config import settings
from app.models.user import User

GOOGLE_VERIFY = "app.api.auth.google_id_token.verify_oauth2_token"
GOOGLE_SUB = "google-uid-12345"
GOOGLE_EMAIL = "googleuser@gmail.com"


def _google_id_info(sub=GOOGLE_SUB, email=GOOGLE_EMAIL):
    return {"sub": sub, "email": email}


async def test_register_success_201(client):
    resp = await client.post("/auth/register", json={"username": "alice", "password": "securepass"})
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["username"] == "alice"
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_register_with_email(client):
    resp = await client.post(
        "/auth/register",
        json={"username": "bob", "password": "securepass", "email": "bob@example.com"},
    )
    assert resp.status_code == 201
    assert resp.json()["email"] == "bob@example.com"


async def test_register_token_valid_jwt(client):
    resp = await client.post("/auth/register", json={"username": "carol", "password": "securepass"})
    data = resp.json()
    payload = jwt.decode(data["access_token"], settings.secret_key, algorithms=["HS256"])
    assert payload["sub"] == data["id"]


async def test_register_password_hashed(client, db_session):
    await client.post("/auth/register", json={"username": "dave", "password": "securepass"})
    result = await db_session.execute(select(User).where(User.username == "dave"))
    user = result.scalar_one()
    assert user.password_hash != "securepass"
    assert bcrypt.checkpw(b"securepass", user.password_hash.encode())


async def test_duplicate_username_409(client):
    await client.post("/auth/register", json={"username": "eve", "password": "securepass"})
    resp = await client.post("/auth/register", json={"username": "eve", "password": "securepass"})
    assert resp.status_code == 409


async def test_duplicate_email_409(client):
    await client.post(
        "/auth/register",
        json={"username": "frank", "password": "securepass", "email": "dup@example.com"},
    )
    resp = await client.post(
        "/auth/register",
        json={"username": "grace", "password": "securepass", "email": "dup@example.com"},
    )
    assert resp.status_code == 409


async def test_missing_username_422(client):
    resp = await client.post("/auth/register", json={"password": "securepass"})
    assert resp.status_code == 422


async def test_missing_password_422(client):
    resp = await client.post("/auth/register", json={"username": "alice"})
    assert resp.status_code == 422


async def test_short_username_422(client):
    resp = await client.post("/auth/register", json={"username": "ab", "password": "securepass"})
    assert resp.status_code == 422


async def test_invalid_email_422(client):
    resp = await client.post(
        "/auth/register",
        json={"username": "alice", "password": "securepass", "email": "bad"},
    )
    assert resp.status_code == 422


# --- Login tests ---


async def test_login_success_200(client):
    await client.post("/auth/register", json={"username": "login_user", "password": "securepass"})
    resp = await client.post("/auth/login", json={"username": "login_user", "password": "securepass"})
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["username"] == "login_user"
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_with_email_in_response(client):
    await client.post(
        "/auth/register",
        json={"username": "login_email", "password": "securepass", "email": "login@example.com"},
    )
    resp = await client.post("/auth/login", json={"username": "login_email", "password": "securepass"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "login@example.com"


async def test_login_token_valid_jwt(client):
    await client.post("/auth/register", json={"username": "login_jwt", "password": "securepass"})
    resp = await client.post("/auth/login", json={"username": "login_jwt", "password": "securepass"})
    data = resp.json()
    payload = jwt.decode(data["access_token"], settings.secret_key, algorithms=["HS256"])
    assert payload["sub"] == data["id"]


async def test_login_wrong_password_401(client):
    await client.post("/auth/register", json={"username": "login_wrong", "password": "securepass"})
    resp = await client.post("/auth/login", json={"username": "login_wrong", "password": "wrongpass"})
    assert resp.status_code == 401


async def test_login_nonexistent_user_401(client):
    resp = await client.post("/auth/login", json={"username": "noexist", "password": "securepass"})
    assert resp.status_code == 401


async def test_login_missing_username_422(client):
    resp = await client.post("/auth/login", json={"password": "securepass"})
    assert resp.status_code == 422


async def test_login_missing_password_422(client):
    resp = await client.post("/auth/login", json={"username": "someone"})
    assert resp.status_code == 422


# --- Google auth tests ---


async def test_google_auth_new_user_200(client):
    with patch(GOOGLE_VERIFY, return_value=_google_id_info()):
        resp = await client.post("/auth/google", json={"token": "valid-token"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == GOOGLE_EMAIL
    assert data["email"] == GOOGLE_EMAIL
    assert "access_token" in data


async def test_google_auth_existing_user_200(client):
    with patch(GOOGLE_VERIFY, return_value=_google_id_info()):
        resp1 = await client.post("/auth/google", json={"token": "valid-token"})
        resp2 = await client.post("/auth/google", json={"token": "valid-token"})
    assert resp2.status_code == 200
    assert resp1.json()["id"] == resp2.json()["id"]


async def test_google_auth_returns_email(client):
    with patch(GOOGLE_VERIFY, return_value=_google_id_info(email="custom@example.com")):
        resp = await client.post("/auth/google", json={"token": "valid-token"})
    assert resp.json()["email"] == "custom@example.com"


async def test_google_auth_valid_jwt(client):
    with patch(GOOGLE_VERIFY, return_value=_google_id_info()):
        resp = await client.post("/auth/google", json={"token": "valid-token"})
    data = resp.json()
    payload = jwt.decode(data["access_token"], settings.secret_key, algorithms=["HS256"])
    assert payload["sub"] == data["id"]


async def test_google_auth_invalid_token_401(client):
    with patch(GOOGLE_VERIFY, side_effect=ValueError("Invalid token")):
        resp = await client.post("/auth/google", json={"token": "bad-token"})
    assert resp.status_code == 401


async def test_google_auth_missing_token_422(client):
    resp = await client.post("/auth/google", json={})
    assert resp.status_code == 422

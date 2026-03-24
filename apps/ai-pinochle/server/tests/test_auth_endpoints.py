from unittest.mock import patch

import bcrypt
import jwt
from sqlalchemy import select

from app.config import settings
from app.models.user import User

GOOGLE_VERIFY = "app.api.auth.google_id_token.verify_oauth2_token"
GOOGLE_SUB = "google-uid-12345"
GOOGLE_EMAIL = "googleuser@gmail.com"


def _google_id_info(sub=GOOGLE_SUB, email=GOOGLE_EMAIL, given_name=None, family_name=None, email_verified=True):
    info = {"sub": sub, "email": email, "email_verified": email_verified}
    if given_name is not None:
        info["given_name"] = given_name
    if family_name is not None:
        info["family_name"] = family_name
    return info


async def test_register_success_201(client):
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Alice", "last_name": "Jones", "email": "alice@example.com", "password": "securepass"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["first_name"] == "Alice"
    assert data["last_name"] == "Jones"
    assert data["email"] == "alice@example.com"
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_register_with_last_name(client):
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Bob", "last_name": "Smith", "email": "bob@example.com", "password": "securepass"},
    )
    assert resp.status_code == 201
    assert resp.json()["first_name"] == "Bob"
    assert resp.json()["last_name"] == "Smith"


async def test_register_token_valid_jwt(client):
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Carol", "last_name": "Lee", "email": "carol@example.com", "password": "securepass"},
    )
    data = resp.json()
    payload = jwt.decode(data["access_token"], settings.secret_key, algorithms=["HS256"])
    assert payload["sub"] == data["id"]


async def test_register_password_hashed(client, db_session):
    await client.post(
        "/auth/register",
        json={"first_name": "Dave", "last_name": "Kim", "email": "dave@example.com", "password": "securepass"},
    )
    result = await db_session.execute(select(User).where(User.email == "dave@example.com"))
    user = result.scalar_one()
    assert user.password_hash != "securepass"
    assert bcrypt.checkpw(b"securepass", user.password_hash.encode())


async def test_duplicate_email_409(client):
    await client.post(
        "/auth/register",
        json={"first_name": "Frank", "last_name": "Doe", "email": "dup@example.com", "password": "securepass"},
    )
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Grace", "last_name": "Doe", "email": "dup@example.com", "password": "securepass"},
    )
    assert resp.status_code == 409


async def test_missing_email_422(client):
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Alice", "last_name": "X", "password": "securepass"},
    )
    assert resp.status_code == 422


async def test_missing_password_422(client):
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Alice", "last_name": "X", "email": "alice@example.com"},
    )
    assert resp.status_code == 422


async def test_missing_first_name_422(client):
    resp = await client.post(
        "/auth/register",
        json={"last_name": "X", "email": "alice@example.com", "password": "securepass"},
    )
    assert resp.status_code == 422


async def test_missing_last_name_422(client):
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Alice", "email": "alice@example.com", "password": "securepass"},
    )
    assert resp.status_code == 422


async def test_invalid_email_422(client):
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Alice", "last_name": "X", "email": "bad", "password": "securepass"},
    )
    assert resp.status_code == 422


# --- Login tests ---


async def test_login_success_200(client):
    await client.post(
        "/auth/register",
        json={"first_name": "Login", "last_name": "User", "email": "login@example.com", "password": "securepass"},
    )
    resp = await client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "securepass"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["first_name"] == "Login"
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_with_names_in_response(client):
    await client.post(
        "/auth/register",
        json={"first_name": "Test", "last_name": "User", "email": "names@example.com", "password": "securepass"},
    )
    resp = await client.post(
        "/auth/login",
        json={"email": "names@example.com", "password": "securepass"},
    )
    assert resp.status_code == 200
    assert resp.json()["first_name"] == "Test"
    assert resp.json()["last_name"] == "User"


async def test_login_token_valid_jwt(client):
    await client.post(
        "/auth/register",
        json={"first_name": "JWT", "last_name": "User", "email": "jwt@example.com", "password": "securepass"},
    )
    resp = await client.post(
        "/auth/login",
        json={"email": "jwt@example.com", "password": "securepass"},
    )
    data = resp.json()
    payload = jwt.decode(data["access_token"], settings.secret_key, algorithms=["HS256"])
    assert payload["sub"] == data["id"]


async def test_login_wrong_password_401(client):
    await client.post(
        "/auth/register",
        json={"first_name": "Wrong", "last_name": "User", "email": "wrong@example.com", "password": "securepass"},
    )
    resp = await client.post(
        "/auth/login",
        json={"email": "wrong@example.com", "password": "wrongpass"},
    )
    assert resp.status_code == 401


async def test_login_nonexistent_user_401(client):
    resp = await client.post(
        "/auth/login",
        json={"email": "noexist@example.com", "password": "securepass"},
    )
    assert resp.status_code == 401


async def test_login_missing_email_422(client):
    resp = await client.post("/auth/login", json={"password": "securepass"})
    assert resp.status_code == 422


async def test_login_missing_password_422(client):
    resp = await client.post("/auth/login", json={"email": "a@b.com"})
    assert resp.status_code == 422


# --- Google auth tests ---


async def test_google_auth_new_user_200(client):
    with patch(GOOGLE_VERIFY, return_value=_google_id_info(given_name="Google", family_name="User")):
        resp = await client.post("/auth/google", json={"token": "valid-token"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == GOOGLE_EMAIL
    assert data["first_name"] == "Google"
    assert data["last_name"] == "User"
    assert "access_token" in data


async def test_google_auth_fallback_first_name(client):
    """When Google doesn't provide given_name, use email prefix."""
    with patch(GOOGLE_VERIFY, return_value=_google_id_info()):
        resp = await client.post("/auth/google", json={"token": "valid-token"})
    assert resp.status_code == 200
    assert resp.json()["first_name"] == "googleuser"


async def test_google_auth_existing_user_200(client):
    with patch(GOOGLE_VERIFY, return_value=_google_id_info(given_name="G")):
        resp1 = await client.post("/auth/google", json={"token": "valid-token"})
        resp2 = await client.post("/auth/google", json={"token": "valid-token"})
    assert resp2.status_code == 200
    assert resp1.json()["id"] == resp2.json()["id"]


async def test_google_auth_returns_email(client):
    with patch(GOOGLE_VERIFY, return_value=_google_id_info(email="custom@example.com", given_name="C")):
        resp = await client.post("/auth/google", json={"token": "valid-token"})
    assert resp.json()["email"] == "custom@example.com"


async def test_google_auth_valid_jwt(client):
    with patch(GOOGLE_VERIFY, return_value=_google_id_info(given_name="G")):
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

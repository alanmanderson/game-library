import bcrypt
from jose import jwt
from sqlalchemy import select

from app.config import settings
from app.models.user import User


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

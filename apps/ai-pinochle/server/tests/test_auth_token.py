import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.api.auth import _create_access_token
from app.config import settings


def test_sub_claim():
    user_id = uuid.uuid4()
    token = _create_access_token(user_id)
    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    assert payload["sub"] == str(user_id)


def test_exp_claim():
    token = _create_access_token(uuid.uuid4())
    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    expected = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    assert abs((exp - expected).total_seconds()) < 5


def test_valid_jwt():
    token = _create_access_token(uuid.uuid4())
    # Should not raise
    jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def test_different_users_different_tokens():
    t1 = _create_access_token(uuid.uuid4())
    t2 = _create_access_token(uuid.uuid4())
    assert t1 != t2

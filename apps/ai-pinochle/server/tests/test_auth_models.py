import pytest
from pydantic import ValidationError

from app.api.auth import RegisterRequest


def test_valid_minimal():
    req = RegisterRequest(username="alice", password="securepass")
    assert req.username == "alice"
    assert req.email is None


def test_valid_with_email():
    req = RegisterRequest(username="alice", password="securepass", email="a@b.com")
    assert req.email == "a@b.com"


def test_username_too_short():
    with pytest.raises(ValidationError):
        RegisterRequest(username="ab", password="securepass")


def test_username_too_long():
    with pytest.raises(ValidationError):
        RegisterRequest(username="a" * 31, password="securepass")


def test_username_invalid_chars():
    with pytest.raises(ValidationError):
        RegisterRequest(username="bad user!", password="securepass")


def test_username_boundary_3():
    req = RegisterRequest(username="abc", password="securepass")
    assert req.username == "abc"


def test_username_boundary_30():
    req = RegisterRequest(username="a" * 30, password="securepass")
    assert len(req.username) == 30


def test_username_underscores():
    req = RegisterRequest(username="my_user_1", password="securepass")
    assert req.username == "my_user_1"


def test_password_too_short():
    with pytest.raises(ValidationError):
        RegisterRequest(username="alice", password="1234567")


def test_password_boundary_8():
    req = RegisterRequest(username="alice", password="12345678")
    assert req.password == "12345678"


def test_invalid_email():
    with pytest.raises(ValidationError):
        RegisterRequest(username="alice", password="securepass", email="not-an-email")


def test_missing_username():
    with pytest.raises(ValidationError):
        RegisterRequest(password="securepass")


def test_missing_password():
    with pytest.raises(ValidationError):
        RegisterRequest(username="alice")

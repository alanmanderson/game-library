import pytest
from pydantic import ValidationError

from app.api.auth import RegisterRequest


def test_valid_all_fields():
    req = RegisterRequest(first_name="Alice", last_name="Smith", email="alice@example.com", password="securepass")
    assert req.first_name == "Alice"
    assert req.last_name == "Smith"
    assert req.email == "alice@example.com"


def test_first_name_required():
    with pytest.raises(ValidationError):
        RegisterRequest(last_name="Smith", email="a@b.com", password="securepass")


def test_first_name_min_length():
    with pytest.raises(ValidationError):
        RegisterRequest(first_name="", last_name="Smith", email="a@b.com", password="securepass")


def test_last_name_required():
    with pytest.raises(ValidationError):
        RegisterRequest(first_name="Alice", email="a@b.com", password="securepass")


def test_last_name_min_length():
    with pytest.raises(ValidationError):
        RegisterRequest(first_name="Alice", last_name="", email="a@b.com", password="securepass")


def test_password_too_short():
    with pytest.raises(ValidationError):
        RegisterRequest(first_name="Alice", last_name="Smith", email="a@b.com", password="1234567")


def test_password_boundary_8():
    req = RegisterRequest(first_name="Alice", last_name="Smith", email="a@b.com", password="12345678")
    assert req.password == "12345678"


def test_invalid_email():
    with pytest.raises(ValidationError):
        RegisterRequest(first_name="Alice", last_name="Smith", email="not-an-email", password="securepass")


def test_missing_email():
    with pytest.raises(ValidationError):
        RegisterRequest(first_name="Alice", last_name="Smith", password="securepass")


def test_missing_password():
    with pytest.raises(ValidationError):
        RegisterRequest(first_name="Alice", last_name="Smith", email="a@b.com")

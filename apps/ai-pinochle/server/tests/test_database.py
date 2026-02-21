from app.database import _make_async_url


def test_postgresql_prefix():
    assert _make_async_url("postgresql://user:pass@host/db") == "postgresql+asyncpg://user:pass@host/db"


def test_postgres_prefix():
    assert _make_async_url("postgres://user:pass@host/db") == "postgresql+asyncpg://user:pass@host/db"


def test_already_async():
    url = "postgresql+asyncpg://user:pass@host/db"
    assert _make_async_url(url) == url


def test_other_scheme():
    url = "sqlite:///test.db"
    assert _make_async_url(url) == url


def test_empty_string():
    assert _make_async_url("") == ""

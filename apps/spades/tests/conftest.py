import pytest
from app import create_app, db as _db


@pytest.fixture
def app():
    """Create application for testing."""
    app = create_app('development')
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'  # in-memory

    with app.app_context():
        _db.create_all()
        yield app
        _db.drop_all()


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()

def test_hello_world(client):
    """Test the root endpoint returns Hello World."""
    response = client.get('/')
    assert response.status_code == 200
    assert response.data == b'Hello, World!'


def test_404_returns_json(client):
    """Test that 404 errors return JSON."""
    response = client.get('/nonexistent')
    assert response.status_code == 404
    assert response.json == {'error': 'Not found'}


def test_app_exists(app):
    """Test that the app was created."""
    assert app is not None


def test_app_is_testing(app):
    """Test that the app is in testing mode."""
    assert app.config['TESTING'] is True

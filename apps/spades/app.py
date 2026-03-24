from __future__ import annotations

import os
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()


def create_app(config_name: str | None = None) -> Flask:
    """Application factory for creating the Flask app."""
    if config_name is None:
        config_name = os.getenv('FLASK_CONFIG', 'development')

    from config import config as config_map
    app = Flask(__name__)
    app.config.from_object(config_map.get(config_name, config_map['default']))

    db.init_app(app)
    migrate.init_app(app, db)

    import models  # noqa: F401 — register models with SQLAlchemy

    @app.route('/')
    def hello_world() -> str:
        return 'Hello, World!'

    @app.errorhandler(404)
    def not_found(e: Exception) -> tuple:
        return jsonify(error='Not found'), 404

    @app.errorhandler(500)
    def internal_error(e: Exception) -> tuple:
        return jsonify(error='Internal server error'), 500

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=os.getenv('FLASK_DEBUG', 'false').lower() == 'true')

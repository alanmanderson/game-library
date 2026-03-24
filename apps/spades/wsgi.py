"""WSGI entrypoint for production deployment.

Usage:
    gunicorn wsgi:app
"""
from app import create_app

app = create_app()

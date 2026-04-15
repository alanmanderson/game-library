import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Ensure the server package is importable (alembic.ini sets prepend_sys_path=.
# but add it explicitly so env.py works regardless of invocation directory).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Read DATABASE_URL from the environment so credentials are never hardcoded.
# Example: postgresql://user:password@localhost:5432/pinochle
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL environment variable is not set")
# Convert async driver URL to sync — Alembic runs synchronously.
database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
# asyncpg uses ?ssl=require but psycopg2 uses ?sslmode=require
database_url = database_url.replace("?ssl=require", "?sslmode=require")
config.set_main_option("sqlalchemy.url", database_url)

# Import models so they register on Base.metadata for autogenerate support.
from app.models.base import Base  # noqa: E402
import app.models  # noqa: E402, F401

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

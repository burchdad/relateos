import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.database import Base, database_url
from app.models import *  # noqa: F401,F403

config = context.config


def _resolve_alembic_url() -> str:
    explicit_env_url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_PUBLIC_URL")
    resolved_url = explicit_env_url or database_url
    allow_local = os.getenv("ALEMBIC_ALLOW_LOCAL_DB", "").lower() in {"1", "true", "yes"}

    # Guardrail: prevent accidentally migrating a default local database when env vars are missing.
    if not explicit_env_url and ("localhost" in resolved_url or "127.0.0.1" in resolved_url) and not allow_local:
        raise RuntimeError(
            "Refusing to run Alembic against implicit local DB URL. "
            "Set DATABASE_URL (or DATABASE_PUBLIC_URL) explicitly, "
            "or set ALEMBIC_ALLOW_LOCAL_DB=1 to allow local migrations intentionally."
        )

    return resolved_url


config.set_main_option("sqlalchemy.url", _resolve_alembic_url())

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
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
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

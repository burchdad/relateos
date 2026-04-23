import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


def _normalize_database_url(raw_url: str | None) -> str:
    if not raw_url:
        return ""

    url = raw_url.strip().strip('"').strip("'")

    # Handle common env entry mistake: value includes the key name itself.
    if url.upper().startswith("DATABASE_URL=") or url.upper().startswith("DATABASE_PUBLIC_URL="):
        url = url.split("=", 1)[1].strip()

    # Unresolved Railway variable reference should be treated as missing.
    if url.startswith("${{") and url.endswith("}}"):
        return ""

    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)

    return url


primary_url = _normalize_database_url(os.getenv("DATABASE_URL"))
public_url = _normalize_database_url(os.getenv("DATABASE_PUBLIC_URL"))
default_url = _normalize_database_url(settings.database_url)

database_url = primary_url or public_url or default_url

# If DATABASE_URL resolves to a private Railway host, prefer public URL when present.
if "proxy.railway.internal" in database_url and public_url:
    database_url = public_url

# Railway Postgres requires SSL; local Postgres typically does not.
_is_remote = not any(host in database_url for host in ("localhost", "127.0.0.1"))
_connect_args = {"sslmode": "require"} if _is_remote else {}

engine = create_engine(database_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

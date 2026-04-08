import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

# Prefer explicit DATABASE_URL, but fall back safely in Railway environments.
database_url = os.getenv("DATABASE_URL") or settings.database_url

# Some Railway templates expose postgres:// style URLs; normalize for SQLAlchemy.
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)

# If DATABASE_URL points to an internal host that is not resolvable from this service,
# use the public URL if available.
if "proxy.railway.internal" in database_url:
    public_url = os.getenv("DATABASE_PUBLIC_URL")
    if public_url:
        database_url = public_url
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)

engine = create_engine(database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

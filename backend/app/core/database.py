import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

# In Railway, DATABASE_URL env var should be passed from the PostgreSQL plugin.
# If not set, fall back to settings default. Log for debugging.
database_url = os.getenv("DATABASE_URL") or settings.database_url

engine = create_engine(database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

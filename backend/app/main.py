import logging
import os
import json
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
from app.routes.ai import router as ai_router
from app.routes.content import router as content_router
from app.routes.dashboard import router as dashboard_router
from app.routes.events import router as events_router
from app.routes.interactions import router as interactions_router
from app.routes.relateos import router as relateos_router
from app.routes.relationships import router as relationships_router
from app.routes.style_profiles import router as style_profiles_router

logger = logging.getLogger(__name__)

# Log the database URL being used (mask password for security)
db_url = os.getenv("DATABASE_URL") or settings.database_url
masked_url = db_url.split("@")[0] + "@" + db_url.split("@")[1] if "@" in db_url else db_url
logger.info(f"Database URL (masked): {masked_url}")

app = FastAPI(title=settings.app_name)


def _normalize_origin(raw_origin: str) -> str | None:
    value = (raw_origin or "").strip().strip("\"").strip("'").rstrip("/")
    if not value:
        return None
    if value == "*":
        return "*"
    if value in {"[", "]"}:
        return None
    if not value.startswith(("http://", "https://")):
        value = f"https://{value.lstrip('/')}"

    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _parse_cors_origins(raw_origins: str) -> list[str]:
    raw = (raw_origins or "").strip()
    if not raw:
        return []

    entries: list[str] = []
    try:
        loaded = json.loads(raw)
        if isinstance(loaded, str):
            entries = [loaded]
        elif isinstance(loaded, list):
            entries = [str(item) for item in loaded]
    except Exception:
        entries = [item for item in raw.split(",")]

    normalized = []
    for item in entries:
        value = _normalize_origin(item)
        if value and value not in normalized:
            normalized.append(value)
    return normalized


@app.on_event("startup")
def startup_tasks():
    if settings.auto_create_tables:
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Auto-create tables enabled: metadata created.")
        except Exception as exc:
            logger.warning("Auto-create tables failed: %s", exc)

allowed_origins = _parse_cors_origins(settings.cors_origins)
if not allowed_origins:
    allowed_origins = ["*"]

allow_credentials = "*" not in allowed_origins
allow_origin_regex = settings.cors_origin_regex.strip() or None

logger.info("Resolved CORS origins: %s", allowed_origins)
if allow_origin_regex:
    logger.info("Resolved CORS origin regex: %s", allow_origin_regex)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(relationships_router, prefix=settings.api_v1_prefix)
app.include_router(interactions_router, prefix=settings.api_v1_prefix)
app.include_router(ai_router, prefix=settings.api_v1_prefix)
app.include_router(content_router, prefix=settings.api_v1_prefix)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)
app.include_router(events_router, prefix=settings.api_v1_prefix)
app.include_router(relateos_router, prefix=settings.api_v1_prefix)
app.include_router(style_profiles_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}

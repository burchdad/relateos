import logging
import os
import json
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text

from app.core.config import settings
from app.core.database import Base, engine
from app.routes.ai import router as ai_router
from app.routes.auth import router as auth_router
from app.routes.contacts import router as contacts_router
from app.routes.connections import router as connections_router
from app.routes.content import router as content_router
from app.routes.content_assets import router as content_assets_router
from app.routes.dashboard import router as dashboard_router
from app.routes.deals import router as deals_router
from app.routes.engagement import router as engagement_router
from app.routes.events import router as events_router
from app.routes.interactions import router as interactions_router
from app.routes.meetings import router as meetings_router
from app.routes.network import router as network_router
from app.routes.organizations import router as organizations_router
from app.routes.recording_artifacts import router as recording_artifacts_router
from app.routes.relateos import router as relateos_router
from app.routes.relationships import router as relationships_router
from app.routes.style_profiles import router as style_profiles_router
from app.routes.tasks import router as tasks_router
from app.routes.team import router as team_router
from app.services.auth_service import AuthService

logger = logging.getLogger(__name__)

DEFAULT_CORS_ORIGIN_REGEX = (
    r"https://.*\.vercel\.app"
    r"|https://.*\.railway\.app"
    r"|http://localhost(:\d+)?"
    r"|http://127\.0\.0\.1(:\d+)?"
)

# Log the database URL being used (mask password for security)
db_url = os.getenv("DATABASE_URL") or settings.database_url
masked_url = db_url.split("@")[0] + "@" + db_url.split("@")[1] if "@" in db_url else db_url
logger.info(f"Database URL (masked): {masked_url}")

BUILD_SHA = os.getenv("RAILWAY_GIT_COMMIT_SHA", os.getenv("GIT_SHA", "dev"))[:8]
ENVIRONMENT = os.getenv("RAILWAY_ENVIRONMENT", os.getenv("ENVIRONMENT", "dev"))

app = FastAPI(title=settings.app_name)

REQUIRED_CONTENT_ITEM_COLUMNS = ["experiment_key", "experiment_variant"]
REQUIRED_APP_USER_COLUMNS = ["workspace_id", "two_factor_enabled", "two_factor_secret", "two_factor_pending_secret"]
REQUIRED_WORKSPACE_SCOPED_TABLES = [
    "organizations",
    "people",
    "relationships",
    "events",
    "relationship_edges",
    "engagement_events",
    "meetings",
]


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


def _validate_schema_requirements() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("content_items"):
        raise RuntimeError("Missing required table: content_items")
    if not inspector.has_table("app_users"):
        raise RuntimeError("Missing required table: app_users")
    if not inspector.has_table("workspaces"):
        raise RuntimeError("Missing required table: workspaces")
    if not inspector.has_table("connector_credentials"):
        raise RuntimeError("Missing required table: connector_credentials")
    if not inspector.has_table("workspace_memberships"):
        raise RuntimeError("Missing required table: workspace_memberships")
    if not inspector.has_table("workspace_invites"):
        raise RuntimeError("Missing required table: workspace_invites")

    existing_columns = {column["name"] for column in inspector.get_columns("content_items")}
    missing_columns = [
        column_name for column_name in REQUIRED_CONTENT_ITEM_COLUMNS if column_name not in existing_columns
    ]
    if missing_columns:
        raise RuntimeError(
            "Schema validation failed for content_items. Missing columns: "
            + ", ".join(missing_columns)
        )

    app_user_columns = {column["name"] for column in inspector.get_columns("app_users")}
    missing_app_user_columns = [
        column_name for column_name in REQUIRED_APP_USER_COLUMNS if column_name not in app_user_columns
    ]
    if missing_app_user_columns:
        raise RuntimeError(
            "Schema validation failed for app_users. Missing columns: "
            + ", ".join(missing_app_user_columns)
        )

    missing_workspace_columns = []
    for table_name in REQUIRED_WORKSPACE_SCOPED_TABLES:
        if inspector.has_table(table_name):
            columns = {column["name"] for column in inspector.get_columns(table_name)}
            if "workspace_id" not in columns:
                missing_workspace_columns.append(table_name)
    if missing_workspace_columns:
        raise RuntimeError(
            "Schema validation failed for workspace scoping. Missing workspace_id on: "
            + ", ".join(missing_workspace_columns)
        )


def _ensure_workspace_connector_schema() -> None:
    """Repair the small workspace/OAuth schema on hosts that skip Alembic."""
    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS workspaces (
                    id UUID PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    owner_user_id UUID NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        connection.execute(text("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS workspace_id UUID NULL"))
        connection.execute(text("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false"))
        connection.execute(text("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT NULL"))
        connection.execute(text("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS two_factor_pending_secret TEXT NULL"))
        for table_name in REQUIRED_WORKSPACE_SCOPED_TABLES:
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS workspace_id UUID NULL"))
            connection.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_workspace_id ON {table_name} (workspace_id)"))
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'app_users_workspace_id_fkey'
                    ) THEN
                        ALTER TABLE app_users
                        ADD CONSTRAINT app_users_workspace_id_fkey
                        FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
                    END IF;
                END $$;
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS connector_credentials (
                    id UUID PRIMARY KEY,
                    workspace_id UUID NOT NULL REFERENCES workspaces(id),
                    connector_key VARCHAR(80) NOT NULL,
                    values JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_connector_credentials_workspace_key
                ON connector_credentials (workspace_id, connector_key)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS workspace_memberships (
                    id UUID PRIMARY KEY,
                    workspace_id UUID NOT NULL REFERENCES workspaces(id),
                    user_id UUID NOT NULL REFERENCES app_users(id),
                    role VARCHAR(40) NOT NULL DEFAULT 'member',
                    status VARCHAR(40) NOT NULL DEFAULT 'active',
                    invited_by_user_id UUID NULL REFERENCES app_users(id),
                    invited_email VARCHAR(255) NULL,
                    accepted_at TIMESTAMPTZ NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT uq_workspace_memberships_workspace_user UNIQUE (workspace_id, user_id)
                )
                """
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_workspace_memberships_workspace_id ON workspace_memberships (workspace_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_workspace_memberships_user_id ON workspace_memberships (user_id)"))
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS workspace_invites (
                    id UUID PRIMARY KEY,
                    workspace_id UUID NOT NULL REFERENCES workspaces(id),
                    invited_email VARCHAR(255) NOT NULL,
                    role VARCHAR(40) NOT NULL DEFAULT 'member',
                    token_hash VARCHAR(128) NOT NULL UNIQUE,
                    status VARCHAR(40) NOT NULL DEFAULT 'pending',
                    invited_by_user_id UUID NULL REFERENCES app_users(id),
                    accepted_by_user_id UUID NULL REFERENCES app_users(id),
                    expires_at TIMESTAMPTZ NOT NULL,
                    accepted_at TIMESTAMPTZ NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_workspace_invites_workspace_id ON workspace_invites (workspace_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_workspace_invites_invited_email ON workspace_invites (invited_email)"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_workspace_invites_token_hash ON workspace_invites (token_hash)"))
        connection.execute(
            text(
                """
                INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, accepted_at, created_at, updated_at)
                SELECT gen_random_uuid(), u.workspace_id, u.id,
                       CASE WHEN w.owner_user_id = u.id THEN 'owner' ELSE 'admin' END,
                       'active', now(), now(), now()
                FROM app_users u
                LEFT JOIN workspaces w ON w.id = u.workspace_id
                WHERE u.workspace_id IS NOT NULL
                ON CONFLICT ON CONSTRAINT uq_workspace_memberships_workspace_user DO NOTHING
                """
            )
        )


@app.on_event("startup")
def startup_tasks():
    if settings.auto_create_tables:
        try:
            Base.metadata.create_all(bind=engine)
            _ensure_workspace_connector_schema()
            logger.info("Auto-create tables enabled: metadata created.")
        except Exception as exc:
            logger.warning("Auto-create tables failed: %s", exc)

    _validate_schema_requirements()
    logger.info("Schema validation passed for content_items experiment columns.")

allowed_origins = _parse_cors_origins(settings.cors_origins)
if not allowed_origins:
    allowed_origins = ["*"]

allow_credentials = "*" not in allowed_origins
configured_origin_regex = settings.cors_origin_regex.strip()
allow_origin_regex = "|".join(
    part for part in [configured_origin_regex, DEFAULT_CORS_ORIGIN_REGEX] if part
) or None

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


@app.middleware("http")
async def _api_auth_middleware(request: Request, call_next):
    path = request.url.path
    auth_prefix = f"{settings.api_v1_prefix}/auth"
    zoom_webhook_path = f"{settings.api_v1_prefix}/connections/zoom/webhook"
    zoom_oauth_callback_path = f"{settings.api_v1_prefix}/connections/zoom/oauth/callback"
    google_oauth_callback_path = f"{settings.api_v1_prefix}/connections/google-calendar/oauth/callback"
    team_invite_preview_path = f"{settings.api_v1_prefix}/team/invites/preview"
    if (
        request.method == "OPTIONS"
        or not path.startswith(settings.api_v1_prefix)
        or path.startswith(auth_prefix)
        or path == zoom_webhook_path
        or path == zoom_oauth_callback_path
        or path == google_oauth_callback_path
        or path == team_invite_preview_path
    ):
        return await call_next(request)

    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        user = AuthService.bearer_user(db, request.headers.get("authorization"))
        if not user:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        request.state.user = user
    finally:
        db.close()

    return await call_next(request)

_CORS_REGEX = re.compile(
    r"https://.*\.vercel\.app"
    r"|https://.*\.railway\.app"
    r"|http://localhost(:\d+)?"
    r"|http://127\.0\.0\.1(:\d+)?"
)


@app.exception_handler(HTTPException)
async def _http_exception_cors_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Re-implement FastAPI's default HTTPException handler so CORS headers are always included."""
    origin = request.headers.get("origin", "")
    headers: dict[str, str] = dict(exc.headers or {})
    if origin and (origin in allowed_origins or _CORS_REGEX.match(origin)):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers.setdefault("Vary", "Origin")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Ensure CORS headers are present even on unhandled 500 errors."""
    origin = request.headers.get("origin", "")
    headers: dict[str, str] = {}
    if origin and (origin in allowed_origins or _CORS_REGEX.match(origin)):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )

app.include_router(relationships_router, prefix=settings.api_v1_prefix)
app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(interactions_router, prefix=settings.api_v1_prefix)
app.include_router(ai_router, prefix=settings.api_v1_prefix)
app.include_router(connections_router, prefix=settings.api_v1_prefix)
app.include_router(content_router, prefix=settings.api_v1_prefix)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)
app.include_router(events_router, prefix=settings.api_v1_prefix)
app.include_router(relateos_router, prefix=settings.api_v1_prefix)
app.include_router(style_profiles_router, prefix=settings.api_v1_prefix)
app.include_router(tasks_router, prefix=settings.api_v1_prefix)
app.include_router(team_router, prefix=settings.api_v1_prefix)
# Network Intelligence routes
app.include_router(contacts_router, prefix=settings.api_v1_prefix)
app.include_router(organizations_router, prefix=settings.api_v1_prefix)
app.include_router(deals_router, prefix=settings.api_v1_prefix)
app.include_router(network_router, prefix=settings.api_v1_prefix)
app.include_router(engagement_router, prefix=settings.api_v1_prefix)
app.include_router(meetings_router, prefix=settings.api_v1_prefix)
app.include_router(recording_artifacts_router, prefix=settings.api_v1_prefix)
app.include_router(content_assets_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def healthcheck():
    t_start = time.monotonic()
    db_status = "connected"
    migration_revision = None
    schema_valid = False
    errors: list[dict] = []

    _last_db_exc: Exception | None = None
    for _attempt in range(3):
        try:
            with engine.connect() as connection:
                migration_revision = connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar()
            _last_db_exc = None
            break
        except Exception as exc:
            _last_db_exc = exc
            time.sleep(0.5)
    if _last_db_exc is not None:
        db_status = "error"
        errors.append({"component": "db", "message": str(_last_db_exc)})

    if db_status == "connected":
        try:
            inspector = inspect(engine)
            existing = {col["name"] for col in inspector.get_columns("content_items")}
            missing = [c for c in REQUIRED_CONTENT_ITEM_COLUMNS if c not in existing]
            schema_valid = len(missing) == 0
            if missing:
                errors.append({"component": "schema", "message": f"missing columns: {', '.join(missing)}"})
        except Exception as exc:
            errors.append({"component": "schema", "message": str(exc)})

    latency_ms = round((time.monotonic() - t_start) * 1000)
    overall = "ok" if db_status == "connected" and schema_valid and not errors else "degraded"
    response = {
        "status": overall,
        "app": "running",
        "db": db_status,
        "migrations": migration_revision,
        "schema_valid": schema_valid,
        "version": BUILD_SHA,
        "environment": ENVIRONMENT,
        "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "latency_ms": latency_ms,
    }
    if errors:
        response["errors"] = errors

    status_code = 200 if overall == "ok" else 503
    return JSONResponse(content=response, status_code=status_code)

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
from app.routes.ai import router as ai_router
from app.routes.dashboard import router as dashboard_router
from app.routes.interactions import router as interactions_router
from app.routes.relationships import router as relationships_router
from app.routes.style_profiles import router as style_profiles_router

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)


@app.on_event("startup")
def startup_tasks():
    if settings.auto_create_tables:
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Auto-create tables enabled: metadata created.")
        except Exception as exc:
            logger.warning("Auto-create tables failed: %s", exc)

allowed_origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
if not allowed_origins:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(relationships_router, prefix=settings.api_v1_prefix)
app.include_router(interactions_router, prefix=settings.api_v1_prefix)
app.include_router(ai_router, prefix=settings.api_v1_prefix)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)
app.include_router(style_profiles_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}

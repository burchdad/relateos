from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
from app.routes.ai import router as ai_router
from app.routes.dashboard import router as dashboard_router
from app.routes.interactions import router as interactions_router
from app.routes.relationships import router as relationships_router


Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(relationships_router, prefix=settings.api_v1_prefix)
app.include_router(interactions_router, prefix=settings.api_v1_prefix)
app.include_router(ai_router, prefix=settings.api_v1_prefix)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}

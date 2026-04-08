from celery import Celery

from app.core.config import settings


celery = Celery("relateos", broker=settings.redis_url, backend=settings.redis_url)
celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

celery.conf.beat_schedule = {
    "recalculate-priority-scores": {
        "task": "app.workers.tasks.recalculate_scores",
        "schedule": 600.0,
    }
}

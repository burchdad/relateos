#!/bin/sh
set -e

# Run migrations on startup to keep runtime schema in sync.
if [ -z "${DATABASE_URL}" ] && [ -z "${DATABASE_PUBLIC_URL}" ]; then
  echo "[startup] DATABASE_URL not set; allowing intentional local Alembic run."
  export ALEMBIC_ALLOW_LOCAL_DB=1
fi

echo "[startup] Running Alembic migrations..."
alembic upgrade head

echo "[startup] Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

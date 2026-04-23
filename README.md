# RelateOS MVP

RelateOS is an AI-native Relationship Intelligence Platform focused on one core question:

> Who should I talk to today, and what should I say?

This MVP includes:

- FastAPI backend with PostgreSQL models
- Celery + Redis background workers
- AI-powered summaries and message suggestions
- Signal-driven priority scoring engine
- Next.js 14 Daily Command Center dashboard

## Architecture

- Backend: FastAPI + SQLAlchemy
- Frontend: Next.js 14 (App Router, TypeScript, Tailwind)
- Database: PostgreSQL
- Async: Celery + Redis
- AI: OpenAI API (fallback text if no key is set)

## Project Structure

- `backend/app/main.py`
- `backend/app/core/`
- `backend/app/models/`
- `backend/app/schemas/`
- `backend/app/services/`
- `backend/app/routes/`
- `backend/app/workers/`
- `backend/app/utils/`
- `backend/scripts/seed.py`
- `frontend/app/dashboard/page.tsx`
- `frontend/components/`

## Data Model

Implemented tables:

- `people`
- `relationships`
- `interactions`
- `opportunities`
- `ai_insights`
- `relationship_signals`
- `user_style_profiles`
- `content_items`
- `content_insights`
- `events`
- `content_relationship_targets`

## API Endpoints

Base prefix: `/api/v1`

Relationships:

- `POST /relationships`
- `GET /relationships`
- `GET /relationships/{id}`
- `PATCH /relationships/{id}/stage`

Interactions:

- `POST /interactions`
- `GET /relationships/{id}/interactions`

AI:

- `POST /ai/summary/{relationship_id}`
- `POST /ai/message/{relationship_id}`
- `POST /ai/insights/{relationship_id}`

Preferences:

- `GET /preferences/style/{owner_user_id}`
- `PUT /preferences/style/{owner_user_id}`

Dashboard:

- `GET /dashboard/priorities?limit=5..10`
- `GET /dashboard/score-explanation/{relationship_id}`

Content + Event Engine:

- `POST /content`
- `GET /content`
- `GET /content/{id}`
- `POST /content/{id}/generate-summary`
- `GET /content/{id}/targets`
- `GET /content/{id}/followups`
- `POST /events`
- `GET /events`

## Scoring Formula

Priority score is now signal-driven and explainable:

1. Derive relationship signals, for example:
   - `RECENT_REPLY`
   - `NO_CONTACT_21_DAYS`
   - `ACTIVE_DEAL`
   - `HIGH_VALUE_CONTACT`
   - `NEGATIVE_SENTIMENT`
   - `FOLLOW_UP_DUE`
2. Apply a configured weight and magnitude for each signal.
3. Compute a 0-100 score and store it in `relationships.priority_score`.
4. Persist active signals in `relationship_signals` for dashboard explainability.

Dashboard output now includes:

- urgency level (`Act Today`, `This Week`, `Low Priority`)
- top signal reasons used for ranking

Score explanations include:

- base score
- total signal impact
- per-signal contribution (`weight * magnitude`) with reason text

## Local Run Instructions

### 1) Start infrastructure

From repo root:

```bash
docker compose up -d
```

This starts:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

### 2) Run backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set `OPENAI_API_KEY` (optional for full AI output).

Start API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run DB migrations (recommended for production):

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

### 3) Seed test data

In another terminal:

```bash
cd backend
source .venv/bin/activate
python -m scripts.seed
```

Seeds 15 relationships with varied history, opportunities, and starter AI insights.
The seed step also auto-creates default style profiles for each unique seeded owner.

### 4) Run Celery worker + beat

Worker terminal:

```bash
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app.celery worker --loglevel=info
```

Beat terminal:

```bash
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app.celery beat --loglevel=info
```

Background jobs:

- Summary generation after interactions
- Insight generation
- Periodic score recalculation

### 5) Run frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open:

- Dashboard: `http://localhost:3000/dashboard`
- Content Engine: `http://localhost:3000/content`
- Events: `http://localhost:3000/events`
- API docs: `http://localhost:8000/docs`

## Railway + Vercel Deployment

Recommended split:

- Frontend: Vercel
- Backend API: Railway service
- Worker: Railway service (same image, worker command)
- Redis: Railway Redis
- Postgres: Railway Postgres

### Backend services (Railway)

Create two Railway services from `backend/`:

If Railway is connected to the repo root and shows a Railpack error like "start.sh not found", this repo now includes a root `Dockerfile` and `railway.toml` so Railway can build the backend API directly from monorepo root.

For one-click service creation with no command overrides:

- API service: use `Dockerfile`
- Worker service: use `Dockerfile.worker`

1) API service command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
```

2) Worker service command:

```bash
celery -A app.workers.celery_app.celery worker --loglevel=info
```

If using `Dockerfile.worker`, no Railway Start Command override is needed.

Environment variables for both services:

- `DATABASE_URL`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `CONTENT_BULK_SEND_MAX` (default `20`)
- `API_V1_PREFIX=/api/v1`
- `CORS_ORIGINS=https://<your-vercel-domain>`

Important: ensure `DATABASE_URL` is set from your Railway Postgres service reference. If missing, the app falls back to local defaults intended only for local development.

Optional additional worker service for scheduled jobs:

```bash
celery -A app.workers.celery_app.celery beat --loglevel=info
```

### Frontend (Vercel)

Deploy `frontend/` and set:

- `NEXT_PUBLIC_API_URL=https://<your-railway-api-domain>/api/v1`

### Production checks

- `GET /health` responds OK on Railway
- CORS allows only Vercel domains
- Worker can connect to Redis and Postgres
- Posting `POST /interactions` enqueues AI tasks successfully

## MVP Workflow

1. Dashboard loads top priority relationships.
2. Each card shows:
   - Name
   - Why it matters (AI summary)
   - Why now (score-derived reason)
   - Suggested message
3. Clicking `Send` simulates outreach by logging an interaction to the backend.
4. AI summary and insights jobs are queued.
5. Priority scores refresh over time (and after interactions).

## Campaign Validation

Use the campaign scorecard in [docs/campaign-scorecard.md](docs/campaign-scorecard.md) to run and measure a live campaign with clear send/reply/call/opportunity thresholds.

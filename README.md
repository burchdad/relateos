# RelateOS MVP

RelateOS is an AI-native Relationship Intelligence Platform focused on one core question:

> Who should I talk to today, and what should I say?

This MVP includes:

- FastAPI backend with PostgreSQL models
- Celery + Redis background workers
- AI-powered summaries and message suggestions
- Priority scoring engine
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

Dashboard:

- `GET /dashboard/priorities?limit=5..10`

## Scoring Formula

Priority score is computed as:

- Opportunity * 0.35
- Risk * 0.25
- Value * 0.25
- Recency * 0.15

The result is normalized and stored as a 0-100 score in `relationships.priority_score`.

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

### 3) Seed test data

In another terminal:

```bash
cd backend
source .venv/bin/activate
python -m scripts.seed
```

Seeds 15 relationships with varied history, opportunities, and starter AI insights.

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
- API docs: `http://localhost:8000/docs`

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

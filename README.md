# roc-job-radar

Local Rochester job radar: scrape selected employer career sites, persist posting history, and expose backend APIs for monitoring new opportunities.

## Current Status

- Backend implemented and actively developed
- Frontend implemented — 3-page dashboard (Jobs, Admin, Analytics)
- Migration flow aligned with Drizzle ledger checks

## Current Functionality

- Scrapes active employer adapters:
  - Paychex
  - Wegmans
  - University of Rochester
  - L3Harris
- Applies Rochester-area location filtering during ingestion
- Persists job lifecycle (`first_seen_at`, `last_seen_at`, `removed_at`)
- Runs scheduled scrapes (default configured via `SCRAPE_CRON`)
- Default schedule value:
  - `SCRAPE_CRON=0 8 * * *` (once daily, from `.env.example`)
- Supports manual scrape trigger
- Tracks scrape run history and per-employer metrics (attempts, retries, errors)

## Quickstart (Docker)

Prereqs:
- Docker Desktop running

Setup:
1. Copy `.env.example` to `.env.development` and set values.
2. Start services:

```bash
docker compose up
```

3. Verify backend health:

```bash
curl http://localhost:3000/health
```

4. Open the frontend:

```bash
http://localhost:3001
```

Notes:
- The Docker `frontend` service runs the Vite dev server on port `3001` with hot reload.
- After changing frontend Docker config, rebuild that service with `docker compose up -d --build frontend`.
- The backend remains available on `http://localhost:3000`.

## Runtime Modes

- Local non-container backend bind: `SERVER_HOST=127.0.0.1`
- Containerized backend bind: `SERVER_HOST=0.0.0.0` (controlled by Docker/network boundaries)

## API Summary

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Service health check |
| GET | `/api/jobs` | Filters: `employerId`/`employer_id`, `status`, `new`, `newHours`, `q` |
| GET | `/api/jobs/:id` | Job detail |
| GET | `/api/employers` | Active employers only |
| GET | `/api/employers?all=true` | Include inactive employers |
| POST | `/api/scrape` | Trigger manual scrape run |
| GET | `/api/scrape/status?limit=n` | Run status + recent history (`limit` 1..50, default 10) |

Manual scrape trigger example:

```bash
curl -X POST http://localhost:3000/api/scrape
```

## Development Commands

From repo root:

```bash
# dockerized frontend dev server with hot reload on port 3001
docker compose up -d frontend

# backend dev server (without Docker)
npm --workspace @roc-job-radar/backend run dev

# backend tests
npm --workspace @roc-job-radar/backend test

# backend typecheck/build
npm --workspace @roc-job-radar/backend run build

# db migration apply
npm --workspace @roc-job-radar/backend run db:migrate

# db migration diff/check
npm --workspace @roc-job-radar/backend run db:generate

# db seed
npm --workspace @roc-job-radar/backend run db:seed

# frontend dev server without Docker (port 5173)
npm --workspace @roc-job-radar/frontend run dev

# frontend tests
npm --workspace @roc-job-radar/frontend test
```

## Migration validation (required)

Use this after any schema or migration change:

```bash
npm --workspace @roc-job-radar/backend run db:generate
npm --workspace @roc-job-radar/backend run db:migrate
npm --workspace @roc-job-radar/backend run db:verify-journal
psql postgresql://rjr:changeme@localhost:5432/roc_job_radar -c "SELECT id, to_timestamp(created_at/1000) AS applied_at, hash FROM drizzle.__drizzle_migrations ORDER BY id DESC;"
psql postgresql://rjr:changeme@localhost:5432/roc_job_radar -c "\\d public.scrape_run_employers"
```

`db:verify-journal` checks file/journal consistency and validates that `_journal.json` `entries[].when` values are strictly increasing in entry order.

## AI normalization (Ollama / gemma3)

- New package: `packages/ai-agent`
- New backend columns:
  - `salary_normalized_raw`
  - `salary_normalized_min`
  - `salary_normalized_max`
  - `salary_currency`
  - `salary_period`
  - `requirements_text`
  - `requirements_html`
  - `responsibilities_text`
  - `responsibilities_html`
  - `summary_text`
  - `normalized_description_text`
  - `normalized_description_html`
  - `ai_payload`
  - `ai_provider`
  - `ai_model`
  - `ai_normalized_at`
  - `ai_warnings`

Ollama compose service and helper:

```bash
docker compose up
docker compose exec ollama ollama pull gemma3
```

Set `AI_ENABLED=true` only when you want ingestion to call Ollama (off by default).

Important:
- AI settings such as `AI_ENABLED` and `AI_MAX_PARALLELISM` are read from local `.env.development`.
- `.env.development` is gitignored, so those values are developer-local and not part of the repo's committed defaults.

## Current Scope / Non-goals

- No authentication (personal/local tool)
- No notifications
- No multi-user support

## License

MIT

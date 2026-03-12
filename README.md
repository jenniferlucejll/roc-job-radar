# roc-job-radar

Local Rochester job radar: scrape selected employer career sites, persist posting history, and expose backend APIs for monitoring new opportunities.

## Current Status

- Backend implemented and actively developed
- Frontend workspace exists but UI implementation is deferred

## Current Functionality

- Scrapes active employer adapters:
  - Paychex
  - Wegmans
  - University of Rochester
  - L3Harris
- Applies Rochester-area location filtering during ingestion
- Persists job lifecycle (`first_seen_at`, `last_seen_at`, `removed_at`)
- Runs scheduled scrapes (default every 6 hours)
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
# backend dev server (without Docker)
npm --workspace @roc-job-radar/backend run dev

# backend tests
npm --workspace @roc-job-radar/backend test

# backend typecheck/build
npm --workspace @roc-job-radar/backend run build

# db migration apply
npm --workspace @roc-job-radar/backend run db:migrate

# db seed
npm --workspace @roc-job-radar/backend run db:seed
```

## Current Scope / Non-goals

- No authentication (personal/local tool)
- No notifications yet
- No multi-user support
- Frontend feature development deferred while backend ingestion/reliability is hardened

## License

MIT

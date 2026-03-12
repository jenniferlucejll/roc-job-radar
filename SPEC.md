# roc-job-radar — Project Specification

> Last updated: 2026-03-11
> Status: Backend implemented (active development), frontend implemented.

---

## 1. Project Goal

Build a locally operated job aggregator for Rochester, NY employers. The backend scrapes selected career sites, stores discovered postings with history, and exposes APIs for viewing jobs and scrape health.

Primary value: quickly identifying newly visible Rochester-area opportunities.

---

## 2. Current Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + Recharts | Implemented — 3-page app (Jobs, Admin, Analytics) |
| Backend | Node.js + TypeScript + Express | Implemented |
| Database | PostgreSQL | Dockerized in development |
| ORM | Drizzle ORM + drizzle-kit | Schema-as-code + committed migrations |
| Scraping | fetch + cheerio-based parsing utilities | Adapters use ATS JSON feeds where available |
| Scheduling | node-cron (in-process) | Manual + scheduled runs |
| Testing | Vitest + React Testing Library | Backend: scrapers, pipeline, API routes, config, scheduler. Frontend: API client, analytics utils, pages, components |
| Package manager | npm workspaces | Monorepo |

TypeScript strict mode is enabled.

---

## 3. Repository Layout

```
roc-job-radar/
├── SPEC.md
├── README.md
├── docker-compose.yml
├── docker-compose.override.yml
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   ├── scheduler.ts
│   │   │   ├── config.ts
│   │   │   ├── db/
│   │   │   ├── api/
│   │   │   └── scrapers/
│   │   └── tests/
│   └── frontend/
│       ├── src/
│       │   ├── api/          # typed fetch wrappers
│       │   ├── components/   # Header, SearchBar, JobCardLarge, JobModal, etc.
│       │   ├── pages/        # HomePage, AdminPage, AnalyticsPage
│       │   ├── types/        # shared TypeScript interfaces
│       │   └── utils/        # analytics pure functions
│       └── vitest.config.ts
```

---

## 4. Implemented Employer Scope

Current active adapter set:
- Paychex (`jibe`)
- Wegmans (`custom` + TalentBrew endpoint)
- University of Rochester (`workday`)
- L3Harris (`talentbrew`)

ESL was intentionally retired from the active ingestion scope.

---

## 5. Database Schema (Source of Truth: Drizzle)

Defined in `packages/backend/src/db/schema.ts`.

### `employers`
- `id` serial PK
- `key` text unique not null
- `name` text not null
- `career_url` text not null
- `ats_type` text not null
- `active` boolean not null default true
- `created_at` timestamp not null default now()

### `jobs`
- `id` serial PK
- `employer_id` integer FK -> employers.id (not null)
- `external_id` text not null
- `title` text not null
- `url` text not null
- `location` text nullable
- `remote_status` text nullable
- `department` text nullable
- `description_html` text nullable
- `salary_raw` text nullable
- `date_posted_at` timestamp nullable
- `first_seen_at` timestamp not null default now()
- `last_seen_at` timestamp not null default now()
- `removed_at` timestamp nullable

Constraints:
- unique (`employer_id`, `external_id`)
- unique (`url`)

### `scrape_errors`
- `id` serial PK
- `employer_id` integer FK -> employers.id (nullable)
- `error_type` text not null
- `message` text not null
- `created_at` timestamp not null default now()
- `resolved_at` timestamp nullable

### `scrape_runs`
- run-level metrics and status history (`running`/`success`/`partial_error`/`failed`)
- includes duration, jobs inserted/updated/removed, request/retry totals, open error count

### `scrape_run_employers`
- per-employer metrics for each run
- includes status, jobs scraped/filtered/inserted/updated/removed, request/retry counts, unresolved errors, structured error payload
- unique (`run_id`, `employer_id`)

### `keyword_filters`
- `id` serial PK
- `keyword` text unique not null
- `active` boolean not null default true
- `created_at` timestamp not null default now()

Note: `keyword_filters` is currently seeded and available, but not required in the active pipeline filtering path.

---

## 6. Scraper Architecture

### Base adapter contract
Each adapter extends `BaseScraper` with:
- `employerKey`
- `scrape(context?) => Promise<ScrapedJob[]>`

`ScrapedJob` fields include:
- `externalId`, `title`, `url`
- optional `location`, `remoteStatus`, `department`, `descriptionHtml`, `salaryRaw`, `datePostedAt`

### Pipeline behavior
For each active employer:
1. Check robots.txt permission.
2. Invoke adapter scrape.
3. Apply Rochester-area location filter.
4. Persist inserts/updates and clear `removed_at` on reappearance.
5. Soft-remove missing jobs (`removed_at`).
6. Record run-level and employer-level metrics/errors.

### Reliability features
- request retry with bounded attempts + linear backoff
- request throttling support for adapters
- robots.txt fetch + 24h in-memory cache
- per-employer failure isolation (pipeline continues on errors)
- persisted scrape run history and per-employer breakdowns

---

## 7. Filtering Contract (Current)

The active ingestion filter is **Rochester-area location matching**.

A job is retained when its location is recognized as greater Rochester (NY indicator plus Rochester/Monroe County/suburb matching). Non-matching jobs are excluded before persistence.

`keyword_filters` and department keyword matching utilities exist as optional capability and future extension, but are not a required gate in current pipeline behavior.

---

## 8. Scheduler and Scrape Status

- In-process scheduler via `node-cron`
- Default cron: `0 */6 * * *` (`SCRAPE_CRON`)
- Manual run trigger: `POST /api/scrape`
- Single-run lock: only one run executes at a time
- Status endpoint returns:
  - run state (`running`, `runId`, `lastStartedAt`)
  - last persisted result (if present)
  - recent run summaries
  - optional `limit` query param, range `1..50`, default `10`

---

## 9. REST API (Implemented)

Base path: `/api`

| Method | Path | Description |
|---|---|---|
| GET | `/jobs` | List jobs with filters: `employerId` or `employer_id`, `status` (`active` default, `removed`, `all`), `new` (`true`/`1`), `newHours`, `q` (title contains) |
| GET | `/jobs/:id` | Get one job |
| GET | `/employers` | List active employers by default |
| GET | `/employers?all=true` | Include inactive employers |
| POST | `/scrape` | Trigger scrape run; returns `202` + `{ started, runId }` |
| GET | `/scrape/status?limit=n` | Scrape status + run history |

Errors return JSON shape `{ error: string, code: string }`.

---

## 10. Environment Variables

Defined in `.env.example` and loaded for backend runtime.

Core:
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `SERVER_HOST`, `PORT`, `NODE_ENV`
- `SCRAPE_CRON`, `SCRAPE_TIMEOUT_MS`, `SCRAPE_MAX_RETRY_ATTEMPTS`, `SCRAPE_RETRY_BASE_DELAY_MS`, `SCRAPE_REQUEST_INTERVAL_MS`, `USER_AGENT`

---

## 11. Networking and Security Stance

API remains unauthenticated by design for personal use, so exposure must stay constrained.

Recommended host binding policy:
- Local non-container runs: `SERVER_HOST=127.0.0.1`
- Containerized runs: `SERVER_HOST=0.0.0.0` with access controlled by Docker port publishing and host firewall/network boundaries

No public internet exposure is assumed.

---

## 12. Docker Notes

- `docker-compose.yml` runs postgres + backend
- backend service sets `POSTGRES_HOST=postgres`
- backend service sets `SERVER_HOST=0.0.0.0` for container networking
- `docker-compose.override.yml` provides dev conveniences (ports, hot reload mounts)

---

## 13. Testing Scope

Current automated tests cover:

Backend:
- scraper helpers (robots, retry, throttle, filters)
- adapters (Paychex, U of R, Wegmans, L3Harris)
- pipeline status hydration and run-state behavior
- API route behavior (`/api/scrape`, `/api/employers`)
- config and scheduler behavior

Frontend:
- API client URL building and error handling (all 5 functions)
- Analytics utility functions (`buildCurrentCounts`, `buildMonthlyTrend`)
- HomePage integration (filters, sorting, pagination, modal)
- Pagination component boundary behavior
- JobModal content rendering and close behavior

---

## 14. Out of Scope (Current Phase)

- user authentication
- notifications (email/push)
- multi-user features
- application tracking workflows
- CI/CD design requirements

---

## 15. Roadmap Direction

Backend: reliability + data quality for Rochester ingestion.
Frontend: iterate on UI as new data or workflows emerge (e.g. saved searches, job notes, new analytics views).

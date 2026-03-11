# roc-job-radar — Project Specification

> Last updated: 2026-03-11
> Status: Pre-implementation. This document governs all initial architecture and implementation decisions.

---

## 1. Project Goal

Build a locally-operated job aggregator that scrapes Rochester, NY employer career sites, stores all discovered job postings, and surfaces new tech-relevant roles via a web UI. The primary value is early awareness of newly posted positions at target companies.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Not implemented in initial passes |
| Backend | Node.js + TypeScript + Express | REST API |
| Database | PostgreSQL | Runs in Docker |
| ORM | Drizzle ORM + drizzle-kit | Schema-as-code, versioned migrations |
| Scraping | fetch + cheerio (default), Playwright (fallback) | Method-agnostic adapter interface |
| Testing | Vitest | Unit tests for scraper adapters using HTML fixtures |
| Package manager | npm workspaces | Monorepo |
| Containerization | Docker + docker-compose | Everything runs in Docker |
| Scheduler | node-cron (in-process) | Plus manual trigger via API |

**TypeScript strictness:** `strict: true` across all packages.

---

## 3. Repository Structure

```
roc-job-radar/
├── CLAUDE.md                        # Claude Code instructions (architecture + dev commands)
├── SPEC.md                          # This file
├── README.md
├── .gitignore
├── .env.example                     # Template — never commit .env files
├── .env.development                 # Local dev config (gitignored)
├── .env.production                  # Prod config (gitignored)
├── docker-compose.yml               # Base compose (postgres + backend)
├── docker-compose.override.yml      # Dev overrides (hot reload, volume mounts)
├── package.json                     # npm workspace root (no src here)
└── packages/
    ├── backend/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── drizzle.config.ts        # drizzle-kit config
    │   ├── src/
    │   │   ├── index.ts             # Entry point: starts server + scheduler
    │   │   ├── server.ts            # Express app setup, routes mounted here
    │   │   ├── scheduler.ts         # node-cron setup, kicks off scrape pipeline
    │   │   ├── config.ts            # Reads and validates env vars
    │   │   ├── db/
    │   │   │   ├── schema.ts        # Drizzle table definitions
    │   │   │   ├── client.ts        # postgres.js connection + Drizzle instance
    │   │   │   └── migrations/      # drizzle-kit generated SQL files
    │   │   ├── scrapers/
    │   │   │   ├── base.ts          # BaseScraper abstract class / interface
    │   │   │   ├── pipeline.ts      # Orchestrates all adapters, persists results
    │   │   │   ├── filters.ts       # Keyword allowlist + category filter logic
    │   │   │   ├── robots.ts        # robots.txt fetch + caching + check
    │   │   │   └── adapters/
    │   │   │       ├── paychex.ts
    │   │   │       ├── wegmans.ts
    │   │   │       ├── esl.ts
    │   │   │       ├── university-of-rochester.ts
    │   │   │       └── l3harris.ts
    │   │   ├── api/
    │   │   │   ├── routes/
    │   │   │   │   ├── jobs.ts      # GET /api/jobs, GET /api/jobs/:id
    │   │   │   │   ├── employers.ts # GET /api/employers
    │   │   │   │   └── scrape.ts    # POST /api/scrape, GET /api/scrape/status
    │   │   │   └── middleware/
    │   │   │       └── error.ts     # Global error handler
    │   │   └── types/
    │   │       └── index.ts         # Shared TypeScript types
    │   └── tests/
    │       └── scrapers/
    │           ├── fixtures/        # Saved HTML snapshots per employer
    │           │   ├── paychex/
    │           │   ├── wegmans/
    │           │   └── ...
    │           ├── paychex.test.ts
    │           ├── wegmans.test.ts
    │           └── filters.test.ts
    └── frontend/
        ├── package.json             # Placeholder — implementation deferred
        └── README.md                # Notes for future implementation
```

---

## 4. Database Schema

All tables use `snake_case`. Drizzle schema defined in `packages/backend/src/db/schema.ts`.

### `employers`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | text NOT NULL | Human-readable name |
| career_url | text NOT NULL | Base URL of careers page |
| ats_type | text | `workday`, `greenhouse`, `lever`, `icims`, `custom`, null |
| scraper_adapter | text NOT NULL | Name of adapter module (e.g. `paychex`) |
| active | boolean DEFAULT true | Soft-disable an employer without deleting |
| created_at | timestamptz DEFAULT now() | |

### `jobs`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| employer_id | integer FK → employers.id | |
| external_id | text | ID from source (ATS job ID, URL hash, etc.) |
| title | text NOT NULL | |
| url | text NOT NULL UNIQUE | Canonical URL of the job posting |
| location | text | Raw location string from posting |
| remote_status | text | `onsite`, `hybrid`, `remote`, `unknown` |
| department | text | Engineering, IT, etc. — null if not provided |
| description_html | text | Full raw HTML of job description |
| salary_raw | text | Raw salary string if listed, null otherwise |
| date_posted_at | timestamptz | Date from posting if available, null otherwise |
| first_seen_at | timestamptz NOT NULL DEFAULT now() | When we first scraped this job |
| last_seen_at | timestamptz NOT NULL DEFAULT now() | Updated on each scrape where job is still present |
| removed_at | timestamptz | Set when job no longer appears on career site (soft delete) |
| created_at | timestamptz DEFAULT now() | |

**Indexes:** `employer_id`, `removed_at` (for filtering active jobs), `first_seen_at` (for "new" queries).

### `scrape_errors`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| employer_id | integer FK → employers.id | null if error is pipeline-level |
| scraped_at | timestamptz NOT NULL DEFAULT now() | |
| error_type | text | `fetch_failed`, `parse_failed`, `robots_blocked`, `unknown` |
| error_message | text | Full error message / stack |
| resolved_at | timestamptz | Manually cleared once investigated |

### `keyword_filters`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| keyword | text NOT NULL UNIQUE | Case-insensitive match term |
| active | boolean DEFAULT true | |
| match_field | text DEFAULT 'title' | `title`, `description`, or `both` |

---

## 5. Scraper Architecture

### Adapter Interface (BaseScraper)

Each employer adapter implements the following interface:

```typescript
interface ScrapedJob {
  externalId: string;          // Stable identifier per employer (URL, ATS job ID, etc.)
  title: string;
  url: string;
  location?: string;
  remoteStatus?: 'onsite' | 'hybrid' | 'remote' | 'unknown';
  department?: string;
  descriptionHtml?: string;
  salaryRaw?: string;
  datePostedAt?: Date;
}

abstract class BaseScraper {
  abstract employerKey: string;       // Matches employers.scraper_adapter
  abstract scrape(context?: { onRequestAttempt?: (info: { attempt: number; maxAttempts: number; url: string }) => void }): Promise<ScrapedJob[]>;

  // Optional: override to customize dedup strategy
  resolveExternalId(job: ScrapedJob): string {
    return job.url;                   // Default: URL is canonical identity
  }
}
```

**Job identity:** Each adapter is responsible for choosing a stable `externalId`. Default is the posting URL. Adapters using ATS platforms should prefer the ATS job ID (more stable than URL). The pipeline uses `externalId` + `employer_id` to detect seen vs. new jobs.

### Scrape Pipeline (`pipeline.ts`)

For each active employer:

1. Check robots.txt — skip adapter if disallowed, log error.
2. Instantiate adapter, call `scrape()` — catch all errors, log to `scrape_errors`, continue to next employer.
3. Apply tech-job filter (see §6).
4. For each passing job:
   - If `externalId` not in DB → INSERT, set `first_seen_at`, `last_seen_at`.
   - If `externalId` in DB and `removed_at` is set → clear `removed_at`, update `last_seen_at`.
   - If `externalId` in DB and active → update `last_seen_at`.
5. Mark jobs from this employer that were NOT seen in this scrape as removed: set `removed_at = now()` where `last_seen_at < run_start AND removed_at IS NULL`.

### Scraping Methods

Adapters choose their own HTTP strategy. Two helpers provided:

- **`fetchHtml(url)`** — fetch + return HTML string (uses node `fetch`, respects `User-Agent` header).
- **`launchBrowser()`** — returns a Playwright browser page for JS-rendered sites.

Which method each adapter uses is an internal implementation detail of that adapter. The pipeline only calls `scrape()`.

### ATS Strategy

- **Opportunistic:** If an employer's ATS exposes a structured JSON feed or undocumented API (common in Workday, Greenhouse), the adapter should use it instead of HTML parsing.
- Document the ATS type in the `employers` table and in each adapter's header comment.
- Known ATS platforms in seed list: TBD per-adapter (research phase).

---

## 6. Tech Job Filtering

Filtering happens after scraping, before persistence. A job passes if **either** condition is met:

1. **Category filter:** `department` field (if present) matches an allowlist of tech departments (e.g. "Engineering", "Technology", "Information Technology", "Software", "Data", "IT", "Product").

2. **Keyword filter:** If no department match or department is null, check `keyword_filters` table against the job `title` (default) or description. At least one active keyword must match.

**Keyword seed list** (initial, stored in DB via migration seed):
`engineer`, `developer`, `software`, `data`, `devops`, `cloud`, `security`, `architect`, `platform`, `backend`, `frontend`, `fullstack`, `full-stack`, `infrastructure`, `sre`, `qa`, `quality assurance`, `machine learning`, `ml`, `ai`, `analytics`, `database`, `it`, `systems`, `network`, `cyber`

Matching is case-insensitive. The `keyword_filters` table is editable; no code change needed to add/remove terms.

---

## 7. Scheduler

- **In-process scheduler** using `node-cron` inside the Node server.
- Default schedule: every 6 hours (`0 */6 * * *`) — configurable via `SCRAPE_CRON` env var.
- **Manual trigger:** `POST /api/scrape` runs the pipeline immediately (idempotent — only one run at a time).
- **Status:** `GET /api/scrape/status` returns last run metadata and per-run scrape metrics:
  - run id, start time, and completion summary (`jobsInserted`, `jobsUpdated`, `jobsRemoved`, `errors`)
  - per-employer request metrics (`requestAttempts`, `retryAttempts`)
  - unresolved error counts (`openErrors` total and `unresolvedErrors` per employer)
- On prod (Windows), the Node app runs as a Windows Service using `node-windows` or NSSM, ensuring the in-process scheduler survives reboots.

---

## 8. REST API

Base path: `/api`

| Method | Path | Description |
|---|---|---|
| GET | `/jobs` | List jobs. Query params: `employerId`, `status` (active/removed/all), `new` (boolean — seen in last N hours), `q` (text search on title) |
| GET | `/jobs/:id` | Single job detail |
| GET | `/employers` | List all employers with active status |
| POST | `/scrape` | Trigger scrape pipeline manually. Returns `{ runId, started }` |
| GET | `/scrape/status` | Run metadata, request/retry metrics, unresolved errors, and recent run history |

All responses are JSON. Errors return `{ error: string, code: string }` with appropriate HTTP status.

---

## 9. Docker Configuration

### `docker-compose.yml` (base)
- `postgres` service: `postgres:16-alpine`, volume-mounted data dir, env vars from `.env` file.
- `backend` service: built from `packages/backend/Dockerfile`, depends on `postgres`, env vars from `.env` file.

### `docker-compose.override.yml` (dev)
- Backend service mounts source code as volume and runs with `tsx watch` (hot reload).
- Postgres port exposed to host (5432) for direct DB access from host tools.

### Notes
- On Windows prod, run with `docker compose up -d`.
- Postgres data persisted via named Docker volume (`pgdata`).
- App crashes restart via `restart: unless-stopped`.

---

## 10. Environment Variables

Managed via `.env.development` and `.env.production` (both gitignored). Template in `.env.example`.

```
# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=roc_job_radar
POSTGRES_USER=rjr
POSTGRES_PASSWORD=changeme

# App
PORT=3000
NODE_ENV=development

# Scraper
SCRAPE_CRON=0 */6 * * *
SCRAPE_TIMEOUT_MS=30000
SCRAPE_MAX_RETRY_ATTEMPTS=3
SCRAPE_RETRY_BASE_DELAY_MS=1000
SCRAPE_REQUEST_INTERVAL_MS=1000
USER_AGENT=roc-job-radar/1.0 (personal job monitoring tool)

# Optional: Playwright (only needed if any adapter uses headless browser)
# PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
```

---

## 11. Migrations

- Schema defined in `packages/backend/src/db/schema.ts` using Drizzle's TypeScript API.
- Generate migration: `npm run db:generate` → writes SQL to `drizzle/migrations/`.
- Apply migration: `npm run db:migrate` → applies pending migrations against the configured DB.
- Migrations are committed to the repo and applied manually (not auto-run on startup).
- Seed data (employer seed list, initial keyword filters) delivered as a migration or separate seed script.

---

## 12. Testing

- Framework: **Vitest** (TypeScript-native, fast, compatible with ESM).
- Scope: **Unit tests for scraper adapters** using saved HTML fixtures.
- Each adapter has a corresponding fixture directory with saved HTML responses from the actual career site.
- Tests verify that `scrape()` returns correctly shaped `ScrapedJob[]` from the fixture.
- Also unit test `filters.ts` with job fixtures covering edge cases (no department, empty title, etc.).

No integration tests in initial passes. Add later once schema stabilizes.

---

## 13. Employer Seed List

| Employer | Career URL (TBD) | Known ATS | Notes |
|---|---|---|---|
| Paychex | TBD | Workday (likely) | Large tech org |
| Wegmans | TBD | Custom / Workday | Significant tech team |
| ESL Federal Credit Union | TBD | Unknown | Smaller tech org |
| University of Rochester | TBD | Unknown | Mixed academic/IT roles |
| L3Harris | TBD | Workday (likely) | Defense/aerospace engineering |

ATS types and exact career page URLs to be confirmed during adapter implementation.

---

## 14. robots.txt Policy

- Before each adapter runs, the pipeline fetches and parses the employer's `robots.txt`.
- Cache robots.txt responses for 24 hours (in-memory) to avoid redundant requests.
- If `User-agent: *` or `User-agent: roc-job-radar` disallows the career path, skip the adapter and log to `scrape_errors` with `error_type: 'robots_blocked'`.
- Rate limiting: minimum 1 second delay between HTTP requests within a single adapter run.

---

## 15. Key Assumptions

1. **Low volume:** Five employers, running every 6 hours. No caching layer, no queue, no worker processes needed.
2. **Single user:** No auth, no multi-tenancy. The web UI is a personal dashboard.
3. **No notifications in scope (MVP):** User checks the UI manually.
4. **Frontend deferred:** Initial passes are backend-only. The React frontend is a future phase.
5. **Windows service management is out of scope for this spec:** Documented as a deployment concern, not an implementation concern.
6. **Playwright is optional:** Only installed if an adapter actually needs it. Not in base dependencies.
7. **Job descriptions are stored as raw HTML:** No sanitization in the scraper layer. Sanitize on render in the frontend.
8. **No authentication on the API:** The service binds to localhost only. Not exposed publicly.

---

## 16. Out of Scope (MVP)

- Email or push notifications
- User authentication
- Multi-user support
- Job application tracking
- Automated employer discovery
- NLP-based relevance ranking (keyword filter is sufficient for now)
- Frontend implementation (deferred to next phase)
- CI/CD pipeline

---

## 17. Open Questions / Future Decisions

- **Job dedup per adapter:** Each adapter decides its `externalId` strategy. If URL-based dedup proves too fragile for a specific employer (e.g. Workday with session-encoded URLs), switch that adapter to ATS job ID. Document the decision in the adapter's header comment.
- **Playwright dependency:** Defer installing Playwright until at least one adapter requires it. If the first five adapters work with fetch+cheerio, keep Playwright out entirely.
- **Windows Service wrapper:** `node-windows` vs. NSSM — decide during deployment phase.
- **Frontend framework version:** React 18 now, may revisit at implementation time.

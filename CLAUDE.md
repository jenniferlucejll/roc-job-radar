# roc-job-radar — Claude Code Instructions

> This file is loaded automatically by Claude Code in every session.
> Keep it accurate and up to date as the project evolves.

---

## Project Overview

`roc-job-radar` is a personal job aggregator that scrapes Rochester, NY employer career sites and surfaces new tech roles via a web dashboard. See `SPEC.md` for the full specification.

**Current phase:** Backend active development. Frontend implemented and tested.

---

## Architecture

### Repository Layout (npm workspaces monorepo)
```
packages/backend/   Node.js + Express + TypeScript backend (active development)
packages/frontend/  React + Vite frontend (implemented)
docker-compose.yml  Base Docker config (postgres + backend)
docker-compose.override.yml  Dev overrides (hot reload, host port exposure)
```

### Key Backend Abstractions

**Scraper adapter pattern** (`packages/backend/src/scrapers/`)
- `base.ts` — `BaseScraper` abstract class. Each employer is a subclass.
- `adapters/` — One file per employer (`paychex.ts`, `wegmans.ts`, etc.)
- `pipeline.ts` — Orchestrates all adapters: fetch → filter → persist
- `filters.ts` — Keyword allowlist + department category filter
- `robots.ts` — robots.txt fetching, parsing, and 24h in-memory caching

**Database** (`packages/backend/src/db/`)
- `schema.ts` — Drizzle ORM table definitions (source of truth for DB structure)
- `client.ts` — postgres.js connection + Drizzle instance
- `migrations/` — drizzle-kit generated SQL (committed to repo)

**API** (`packages/backend/src/api/routes/`)
- `jobs.ts` — `GET /api/jobs`, `GET /api/jobs/:id`
- `employers.ts` — `GET /api/employers`
- `scrape.ts` — `POST /api/scrape` (manual trigger), `GET /api/scrape/status`

**Scheduler** (`packages/backend/src/scheduler.ts`)
- node-cron, schedule configurable via `SCRAPE_CRON` env var (default: every 6h)
- Only one scrape run at a time (idempotent)

### Frontend (`packages/frontend/src/`)

**3-page React app with React Router v6 + Tailwind CSS + Recharts.**

Pages:
- `/` — Home: full-width search bar, employer/status filters, card/list toggle, paginated job grid (12/page card, 20/page list), job detail modal
- `/admin` — Admin: scrape control + run now button, recent runs table, per-employer breakdown, employers table, job stats
- `/analytics` — Analytics: bar + line charts for jobs by category and by company over time

Key files:
- `pages/` — `HomePage.tsx`, `AdminPage.tsx`, `AnalyticsPage.tsx`
- `components/` — `Header.tsx`, `SearchBar.tsx`, `ViewToggle.tsx`, `Pagination.tsx`, `JobCardLarge.tsx`, `JobListRow.tsx`, `JobModal.tsx`
- `api/client.ts` — typed fetch wrappers for all backend endpoints
- `utils/analytics.ts` — pure functions `buildCurrentCounts` and `buildMonthlyTrend` (used by Analytics page and tested independently)
- `types/index.ts` — shared TypeScript interfaces

Frontend runs on port 5173 (dev) with Vite proxy to backend at port 3000.

### Data Flow
```
cron / POST /api/scrape
  → pipeline.ts: for each active employer
      → check robots.txt
      → adapter.scrape() → ScrapedJob[]
      → filters.ts: keyword + category filter
      → persist: INSERT new jobs, UPDATE last_seen_at, soft-delete removed jobs
      → log errors to scrape_errors table
```

---

## Dev Commands

> All commands assume Docker is running. Run from repo root unless noted.

### Start development environment
```bash
docker compose up          # starts postgres + backend with hot reload
```

### Start frontend dev server (in a separate terminal)
```bash
cd packages/frontend
npm run dev                # Vite on port 5173, proxies /api → localhost:3000
```

### Backend only (without Docker, for rapid iteration)
```bash
cd packages/backend
npm run dev                # tsx watch src/index.ts
```

### Database migrations
```bash
cd packages/backend
npm run db:generate        # generate migration from schema changes (drizzle-kit)
npm run db:migrate         # apply pending migrations
```

### Trigger a scrape manually
```bash
curl -X POST http://localhost:3000/api/scrape
```

### Run tests
```bash
cd packages/backend
npm test                   # vitest
npm run test:watch         # vitest --watch

cd packages/frontend
npm test                   # vitest run
npm run test:watch         # vitest
```

### Access Postgres directly (dev only — port exposed to host)
```bash
psql postgresql://rjr:changeme@localhost:5432/roc_job_radar
```

---

## Commit Workflow

Before creating a commit:

1. Run `git status`
2. Run `git diff`
3. Summarize the change in ONE sentence internally
4. Generate a single Conventional Commit message
5. Create the commit

### Commit Message Format

Use Conventional Commits.

Allowed types:
- feat
- fix
- docs
- refactor
- test
- chore
- ci
- build

Format:

<type>(optional-scope): <short summary>

Examples:

feat(db): add companies table
fix(scraper): handle missing job description
docs(readme): add setup instructions
chore(repo): initialize project structure

### Rules

- Commit messages must be **one line**
- Maximum **72 characters**
- Prefer the **shortest accurate message**
- Use lowercase commit types

### Do Not

- write long explanations
- include a commit body unless explicitly asked
- include multiple paragraphs
- include "This commit..." phrasing
- include "Co-authored-by: Claude" or any Claude attribution
- include "Generated by Claude", "AI assisted", or similar trailers

Claude should **never add its name or attribution** to commits.
Authorship should remain the git user configured in the repository.

---

## Coding Conventions

- **TypeScript `strict: true`** everywhere. No `any` without a comment explaining why.
- **Drizzle schema is the single source of truth** for DB structure. Never hand-edit migration SQL.
- **Never hand-edit `_journal.json`.** The `when` timestamps in `packages/backend/src/db/migrations/meta/_journal.json` are set by `drizzle-kit generate` and must not be modified manually. Drizzle's migrator uses these timestamps as a watermark — editing them can silently cause migrations to be skipped. All schema changes must go through `npm run db:generate` (from `packages/backend`).
- **Each employer adapter is self-contained.** All knowledge about a specific employer's site lives in its adapter file. Include a header comment documenting the ATS type, career URL, and `externalId` strategy used.
- **Errors in scrapers are caught and logged, never thrown up to the pipeline.** The pipeline continues on per-employer failure.
- **robots.txt must be checked before every adapter run.** Never bypass this.
- **No auth on the API.** The server binds to localhost. Do not add public-facing auth complexity.
- **Frontend uses no component library.** Pure Tailwind utility classes only — no Shadcn, MUI, etc.
- **Frontend analytics utils are pure functions.** Keep `buildCurrentCounts` and `buildMonthlyTrend` in `utils/analytics.ts` and test them separately from the React component.

---

## Key Decisions (Why We Made Them)

| Decision | Rationale |
|---|---|
| Drizzle over Prisma | Lighter weight, better TypeScript ergonomics, closer to SQL |
| Docker-only runtime | Targets both Mac (dev) and Windows (prod) consistently |
| In-process node-cron scheduler | Works inside Docker, consistent across platforms, no OS-level config |
| Adapter-per-employer (code, not config) | Career sites are too varied for CSS-selector configs; code adapters handle any quirk |
| Full job history in DB | Enables analytics (how long postings last, rate of new postings) |
| Soft delete for removed jobs | Preserves history; `removed_at` timestamp tells you when a job was filled/pulled |
| Keyword + category filter (both) | Category filter is precise when available; keyword filter is the fallback |
| Notifications out of scope | Personal tool — dashboard review is sufficient for MVP |
| npm over pnpm/bun | Familiarity, no compatibility edge cases |

---

## Environment Setup

Copy `.env.example` to `.env.development` and fill in values before running.

Key env vars:
- `POSTGRES_*` — DB connection
- `SCRAPE_CRON` — cron expression for scheduler
- `USER_AGENT` — sent with all HTTP requests to employer sites
- `SCRAPE_TIMEOUT_MS` — per-request timeout

---

## Adding a New Employer

1. Add a row to the `employers` table (via migration or seed script).
2. Create `packages/backend/src/scrapers/adapters/<employer-key>.ts`.
3. Extend `BaseScraper`, implement `scrape()`.
4. Document in the adapter's header comment: ATS type, career URL, `externalId` strategy, scraping method used (fetch vs. Playwright).
5. Add HTML fixture(s) and a test in `packages/backend/tests/scrapers/`.
6. Register the adapter in `pipeline.ts`.

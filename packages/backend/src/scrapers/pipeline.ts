import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { employers, jobs, keywordFilters, scrapeErrors } from '../db/schema.js';
import { config } from '../config.js';
import type { ScrapeEmployerSummary, ScrapeResult } from '../types/index.js';
import type { BaseScraper } from './base.js';
import { checkRobots } from './robots.js';
import { passesFilter } from './filters.js';
import { eslScraper } from './adapters/esl.js';
import { paychexScraper } from './adapters/paychex.js';
import { l3harrisScraper } from './adapters/l3harris.js';
import { universityOfRochesterScraper } from './adapters/university-of-rochester.js';
import { wegmansScraper } from './adapters/wegmans.js';

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const adapters = new Map<string, BaseScraper>();

export function registerAdapter(adapter: BaseScraper): void {
  adapters.set(adapter.employerKey, adapter);
}

registerAdapter(paychexScraper);
registerAdapter(l3harrisScraper);
registerAdapter(universityOfRochesterScraper);
registerAdapter(wegmansScraper);
registerAdapter(eslScraper);

// ---------------------------------------------------------------------------
// Scrape state
// ---------------------------------------------------------------------------

interface ScrapeState {
  currentRunId: string | null;
  running: boolean;
  lastResult: ScrapeResult | null;
  lastStartedAt: Date | null;
}

const state: ScrapeState = {
  currentRunId: null,
  running: false,
  lastResult: null,
  lastStartedAt: null,
};

export function getScrapeStatus(): {
  running: boolean;
  lastResult: ScrapeResult | null;
  lastStartedAt: string | null;
  runId: string | null;
} {
  return {
    running: state.running,
    lastResult: state.lastResult,
    runId: state.currentRunId ?? state.lastResult?.runId ?? null,
    lastStartedAt: state.lastStartedAt?.toISOString() ?? null,
  };
}

/**
 * Trigger a pipeline run in the background.
 * Returns a run ID when started, or null if a run is already in progress.
 */
let runSequence = 0;

export function triggerPipeline(): string | null {
  if (state.running) return null;

  state.running = true;
  state.currentRunId = `scrape-${Date.now()}-${++runSequence}`;
  state.lastStartedAt = new Date();
  const runId = state.currentRunId;

  runPipeline(runId)
    .then((result) => {
      state.lastResult = result;
    })
    .catch((err: unknown) => {
      console.error('Pipeline failed unexpectedly:', err);
    })
    .finally(() => {
      state.running = false;
      state.currentRunId = null;
    });

  return runId;
}

// ---------------------------------------------------------------------------
// Pipeline internals
// ---------------------------------------------------------------------------

async function runPipeline(runId: string): Promise<ScrapeResult> {
  const startedAt = new Date();
  let employersRun = 0;
  let jobsInserted = 0;
  let jobsUpdated = 0;
  let jobsRemoved = 0;
  let errors = 0;
  const employerSummaries: ScrapeEmployerSummary[] = [];

  const activeEmployers = await db
    .select()
    .from(employers)
    .where(eq(employers.active, true));

  const activeKeywords = await db
    .select({ keyword: keywordFilters.keyword })
    .from(keywordFilters)
    .where(eq(keywordFilters.active, true));

  const keywords = activeKeywords.map((r) => r.keyword);

  for (const employer of activeEmployers) {
    employersRun++;

    const adapter = adapters.get(employer.key);
    const employerSummary: ScrapeEmployerSummary = {
      employerId: employer.id,
      employerKey: employer.key,
      employerName: employer.name,
      status: 'success',
      jobsScraped: 0,
      jobsFiltered: 0,
      jobsInserted: 0,
      jobsUpdated: 0,
      jobsRemoved: 0,
      errors: [],
    };

    if (!adapter) {
      employerSummary.status = 'missing_adapter';
      employerSummary.errors.push({
        errorType: 'missing_adapter',
        message: `No adapter registered for employer key ${employer.key}`,
      });
      errors++;
      await logError(employer.id, 'missing_adapter', `No adapter registered for employer key ${employer.key}`);
      console.warn(`[pipeline] Missing adapter for employer key: ${employer.key}`);
      employerSummaries.push(employerSummary);
      continue;
    }

    try {
      const allowed = await checkRobots(
        employer.careerUrl,
        config.scraper.userAgent,
        config.scraper.timeoutMs,
      );

      if (!allowed) {
        employerSummary.status = 'robots_blocked';
        employerSummary.errors.push({
          errorType: 'robots_blocked',
          message: `robots.txt disallows ${employer.careerUrl}`,
        });
        await logError(employer.id, 'robots_blocked', `robots.txt disallows ${employer.careerUrl}`);
        errors++;
        employerSummaries.push(employerSummary);
        continue;
      }

      const scraped = await adapter.scrape();
      employerSummary.jobsScraped = scraped.length;

      const filtered = scraped.filter((job) => passesFilter(job, keywords));
      employerSummary.jobsFiltered = filtered.length;

      const counts = await persistJobs(employer.id, filtered);
      jobsInserted += counts.inserted;
      jobsUpdated += counts.updated;
      jobsRemoved += counts.removed;
      errors += counts.errors.length;
      employerSummary.errors.push(...counts.errors);
      employerSummary.jobsInserted = counts.inserted;
      employerSummary.jobsUpdated = counts.updated;
      employerSummary.jobsRemoved = counts.removed;

      if (counts.errors.length === 0) {
        await markErrorsResolved(employer.id);
      } else {
        employerSummary.status = 'error';
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorType = classifyError(err);
      await logError(employer.id, errorType, message);
      errors++;
      employerSummary.status = 'error';
      employerSummary.errors.push({ errorType, message });
      console.error(`[pipeline] ${employer.key} failed: ${message}`);
    } finally {
      employerSummaries.push(employerSummary);
    }
  }

  return {
    runId,
    startedAt,
    finishedAt: new Date(),
    employersRun,
    jobsInserted,
    jobsUpdated,
    jobsRemoved,
    errors,
    employers: employerSummaries,
  };
}

async function persistJobs(
  employerId: number,
  scrapedJobs: Awaited<ReturnType<BaseScraper['scrape']>>,
): Promise<{ inserted: number; updated: number; removed: number; errors: ScrapeError[] }> {
  const now = new Date();
  let inserted = 0;
  let updated = 0;
  let removed = 0;
  const errors: ScrapeError[] = [];
  const seenIds = new Set<number>();
  const normalized = normalizeScrapedJobs(scrapedJobs);

  const existing = await db
    .select({
      id: jobs.id,
      externalId: jobs.externalId,
      url: jobs.url,
      title: jobs.title,
      location: jobs.location,
      remoteStatus: jobs.remoteStatus,
      department: jobs.department,
      descriptionHtml: jobs.descriptionHtml,
      salaryRaw: jobs.salaryRaw,
      datePostedAt: jobs.datePostedAt,
      removedAt: jobs.removedAt,
    })
    .from(jobs)
    .where(eq(jobs.employerId, employerId));

  const existingByExtId = new Map(existing.map((j) => [j.externalId, j]));
  const existingByUrl = new Map(existing.map((j) => [j.url, j]));
  const scrapedExtIds = new Set(normalized.map((j) => j.externalId));

  for (const job of normalized) {
    if (!job.url || !job.externalId) continue;

    const ex = existingByExtId.get(job.externalId);
    if (ex) {
      seenIds.add(ex.id);
      const updatedValues = toPersistedJobValues(job, ex.externalId, now);
      await db
        .update(jobs)
        .set(updatedValues)
        .where(eq(jobs.id, ex.id));
      updated++;
      continue;
    }

    const byUrl = existingByUrl.get(job.url);
    if (byUrl) {
      seenIds.add(byUrl.id);
      const updatedValues = toPersistedJobValues(job, byUrl.externalId, now);
      await db
        .update(jobs)
        .set(updatedValues)
        .where(eq(jobs.id, byUrl.id));
      updated++;
      continue;
    }

    try {
      await db.insert(jobs).values({
        employerId,
        externalId: job.externalId,
        title: job.title,
        url: job.url,
        location: job.location ?? null,
        remoteStatus: job.remoteStatus ?? null,
        department: job.department ?? null,
        descriptionHtml: job.descriptionHtml ?? null,
        salaryRaw: job.salaryRaw ?? null,
        datePostedAt: job.datePostedAt ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      inserted++;
    } catch (err: unknown) {
      if (isUniqueConstraintViolation(err)) {
        errors.push({
          errorType: 'url_conflict',
          message: `Could not insert duplicate URL: ${job.url}`,
        });
        continue;
      }
      throw err;
    }
  }

  for (const ex of existing) {
    if (ex.removedAt === null && !seenIds.has(ex.id) && !scrapedExtIds.has(ex.externalId)) {
      await db.update(jobs).set({ removedAt: now }).where(eq(jobs.id, ex.id));
      removed++;
    }
  }

  return { inserted, updated, removed, errors };
}

async function logError(
  employerId: number,
  errorType: string,
  message: string,
): Promise<void> {
  try {
    await db.insert(scrapeErrors).values({ employerId, errorType, message });
  } catch (err) {
    console.error('[pipeline] failed to log error:', err);
  }
}

function toPersistedJobValues(
  job: Awaited<ReturnType<BaseScraper['scrape']>>[number],
  stableExternalId: string,
  now: Date,
): Partial<(typeof jobs)['$inferInsert']> {
  return {
    externalId: stableExternalId,
    title: job.title,
    location: job.location ?? null,
    remoteStatus: job.remoteStatus ?? null,
    department: job.department ?? null,
    descriptionHtml: job.descriptionHtml ?? null,
    salaryRaw: job.salaryRaw ?? null,
    datePostedAt: job.datePostedAt ?? null,
    removedAt: null,
    lastSeenAt: now,
  };
}

function normalizeScrapedJobs(
  scrapedJobs: Awaited<ReturnType<BaseScraper['scrape']>>,
): Awaited<ReturnType<BaseScraper['scrape']>> {
  const uniqueByExternalId = new Map<string, (typeof scrapedJobs)[number]>();
  const uniqueByUrl = new Map<string, (typeof scrapedJobs)[number]>();
  for (const job of scrapedJobs) {
    if (!job.externalId || !job.url) continue;
    uniqueByExternalId.set(job.externalId, job);
  }
  for (const job of uniqueByExternalId.values()) {
    uniqueByUrl.set(job.url, job);
  }

  return Array.from(uniqueByUrl.values());
}

function isUniqueConstraintViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const anyErr = err as { code?: string };
  return anyErr.code === '23505';
}

interface ScrapeError {
  errorType: string;
  message: string;
}

async function markErrorsResolved(employerId: number): Promise<void> {
  try {
    await db
      .update(scrapeErrors)
      .set({ resolvedAt: new Date() })
      .where(and(eq(scrapeErrors.employerId, employerId), isNull(scrapeErrors.resolvedAt)));
  } catch (err) {
    console.error('[pipeline] failed to resolve scrape errors:', err);
  }
}

function classifyError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown';
  const msg = err.message.toLowerCase();
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused')) {
    return 'fetch_failed';
  }
  if (msg.includes('parse') || msg.includes('cheerio') || msg.includes('json')) {
    return 'parse_failed';
  }
  return 'unknown';
}

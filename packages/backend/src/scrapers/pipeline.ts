import { eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { employers, jobs, keywordFilters, scrapeErrors } from '../db/schema.js';
import { config } from '../config.js';
import type { ScrapeResult } from '../types/index.js';
import type { BaseScraper } from './base.js';
import { checkRobots } from './robots.js';
import { passesFilter } from './filters.js';

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const adapters = new Map<string, BaseScraper>();

export function registerAdapter(adapter: BaseScraper): void {
  adapters.set(adapter.employerKey, adapter);
}

// ---------------------------------------------------------------------------
// Scrape state
// ---------------------------------------------------------------------------

interface ScrapeState {
  running: boolean;
  lastResult: ScrapeResult | null;
  lastStartedAt: Date | null;
}

const state: ScrapeState = {
  running: false,
  lastResult: null,
  lastStartedAt: null,
};

export function getScrapeStatus(): {
  running: boolean;
  lastResult: ScrapeResult | null;
  lastStartedAt: string | null;
} {
  return {
    running: state.running,
    lastResult: state.lastResult,
    lastStartedAt: state.lastStartedAt?.toISOString() ?? null,
  };
}

/**
 * Trigger a pipeline run in the background.
 * Returns false if a run is already in progress.
 */
export function triggerPipeline(): boolean {
  if (state.running) return false;

  state.running = true;
  state.lastStartedAt = new Date();

  runPipeline()
    .then((result) => {
      state.lastResult = result;
    })
    .catch((err: unknown) => {
      console.error('Pipeline failed unexpectedly:', err);
    })
    .finally(() => {
      state.running = false;
    });

  return true;
}

// ---------------------------------------------------------------------------
// Pipeline internals
// ---------------------------------------------------------------------------

async function runPipeline(): Promise<ScrapeResult> {
  const startedAt = new Date();
  let employersRun = 0;
  let jobsInserted = 0;
  let jobsUpdated = 0;
  let jobsRemoved = 0;
  let errors = 0;

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
    const adapter = adapters.get(employer.key);
    if (!adapter) continue;

    employersRun++;

    try {
      const allowed = await checkRobots(
        employer.careerUrl,
        config.scraper.userAgent,
        config.scraper.timeoutMs,
      );

      if (!allowed) {
        await logError(employer.id, 'robots_blocked', `robots.txt disallows ${employer.careerUrl}`);
        errors++;
        continue;
      }

      const scraped = await adapter.scrape();
      const filtered = scraped.filter((job) => passesFilter(job, keywords));

      const counts = await persistJobs(employer.id, filtered);
      jobsInserted += counts.inserted;
      jobsUpdated += counts.updated;
      jobsRemoved += counts.removed;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorType = classifyError(err);
      await logError(employer.id, errorType, message);
      errors++;
      console.error(`[pipeline] ${employer.key} failed: ${message}`);
    }
  }

  return {
    startedAt,
    finishedAt: new Date(),
    employersRun,
    jobsInserted,
    jobsUpdated,
    jobsRemoved,
    errors,
  };
}

async function persistJobs(
  employerId: number,
  scrapedJobs: Awaited<ReturnType<BaseScraper['scrape']>>,
): Promise<{ inserted: number; updated: number; removed: number }> {
  const now = new Date();
  let inserted = 0;
  let updated = 0;
  let removed = 0;

  const existing = await db
    .select({ id: jobs.id, externalId: jobs.externalId, removedAt: jobs.removedAt })
    .from(jobs)
    .where(eq(jobs.employerId, employerId));

  const existingByExtId = new Map(existing.map((j) => [j.externalId, j]));
  const scrapedExtIds = new Set(scrapedJobs.map((j) => j.externalId));

  for (const job of scrapedJobs) {
    const ex = existingByExtId.get(job.externalId);
    if (ex) {
      await db
        .update(jobs)
        .set({ lastSeenAt: now, removedAt: null })
        .where(eq(jobs.id, ex.id));
      updated++;
    } else {
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
    }
  }

  for (const ex of existing) {
    if (ex.removedAt === null && !scrapedExtIds.has(ex.externalId)) {
      await db.update(jobs).set({ removedAt: now }).where(eq(jobs.id, ex.id));
      removed++;
    }
  }

  return { inserted, updated, removed };
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

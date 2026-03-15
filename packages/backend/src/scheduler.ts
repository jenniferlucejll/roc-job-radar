import { schedule, validate } from 'node-cron';
import { config } from './config.js';
import { triggerPipeline } from './scrapers/pipeline.js';

let initialized = false;
let scheduledScrapingEnabled = false;
let scheduledJob: ReturnType<typeof schedule> | null = null;

export interface ScrapeControlState {
  scheduledScrapingEnabled: boolean;
  schedulerArmed: boolean;
  resetsOnRestart: true;
}

function armScheduler(): void {
  if (scheduledJob) {
    return;
  }

  const cronExpression = config.scraper.cron;

  if (!validate(cronExpression)) {
    const message = `[scheduler] Invalid cron expression: ${cronExpression}`;
    console.error(message);
    throw new Error(message);
  }

  scheduledJob = schedule(cronExpression, () => {
    triggerPipeline()
      .then((startedRun) => {
        if (!startedRun) {
          console.log('[scheduler] Scrape already in progress; skipping scheduled run');
        }
      })
      .catch((err: unknown) => {
        console.error('[scheduler] Failed to trigger pipeline:', err);
      });
  });

  console.log(`[scheduler] Scheduled scraping armed with ${cronExpression}`);
}

function disarmScheduler(): void {
  if (!scheduledJob) {
    return;
  }

  scheduledJob.stop();
  scheduledJob = null;
  console.log('[scheduler] Scheduled scraping disarmed');
}

export function initializeScheduler(): void {
  if (initialized) {
    return;
  }

  initialized = true;
  scheduledScrapingEnabled = false;
  scheduledJob = null;
  console.log('[scheduler] Scheduled scraping disabled on startup; admin enable required');
}

export function setScheduledScrapingEnabled(enabled: boolean): ScrapeControlState {
  if (!initialized) {
    initializeScheduler();
  }

  if (enabled) {
    const wasEnabled = scheduledScrapingEnabled;
    if (!wasEnabled) {
      console.log('[scheduler] Admin enabled scheduled scraping');
    }
    armScheduler();
    scheduledScrapingEnabled = true;
  } else {
    if (scheduledScrapingEnabled) {
      console.log('[scheduler] Admin disabled scheduled scraping');
    }
    scheduledScrapingEnabled = false;
    disarmScheduler();
  }

  return getScrapeControlState();
}

export function getScrapeControlState(): ScrapeControlState {
  return {
    scheduledScrapingEnabled,
    schedulerArmed: scheduledJob !== null,
    resetsOnRestart: true,
  };
}

export function stopScheduler(): void {
  disarmScheduler();
  scheduledScrapingEnabled = false;
  initialized = false;
}

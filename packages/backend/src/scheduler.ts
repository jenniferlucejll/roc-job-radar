import { schedule, validate } from 'node-cron';
import { config } from './config.js';
import { triggerPipeline } from './scrapers/pipeline.js';

let started = false;
let scheduledJob: ReturnType<typeof schedule> | null = null;

export function startScheduler(): void {
  if (started) {
    return;
  }

  const cronExpression = config.scraper.cron;

  if (!validate(cronExpression)) {
    console.error(`[scheduler] Invalid cron expression: ${cronExpression}`);
    return;
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

  started = true;
  console.log(`[scheduler] Scrape pipeline scheduled with ${cronExpression}`);
}

export function stopScheduler(): void {
  if (!started) return;
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
  }
  started = false;
}

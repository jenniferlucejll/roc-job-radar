import { Router, type Response } from 'express';
import { triggerPipeline, triggerTestPipeline, getScrapeStatus } from '../../scrapers/pipeline.js';
import { getScrapeControlState, setScheduledScrapingEnabled } from '../../scheduler.js';

export const scrapeRouter = Router();

function parseEmployerKey(body: Record<string, unknown> | undefined): string | undefined | null {
  const employerKey = body?.employerKey;
  if (employerKey === undefined) {
    return undefined;
  }

  if (typeof employerKey !== 'string' || employerKey.trim() === '') {
    return null;
  }

  return employerKey.trim();
}

function sendAlreadyRunning(res: Response): void {
  res.status(409).json({
    error: 'Scrape already in progress',
    code: 'SCRAPE_ALREADY_RUNNING',
    started: false,
  });
}

function parseScheduledScrapingEnabled(body: Record<string, unknown> | undefined): boolean | null {
  const value = body?.scheduledScrapingEnabled;
  return typeof value === 'boolean' ? value : null;
}

scrapeRouter.post('/', async (req, res, next) => {
  try {
    const employerKey = parseEmployerKey(req.body as Record<string, unknown> | undefined);

    if (employerKey === null) {
      res.status(400).json({
        error: 'employerKey must be a non-empty string',
        code: 'INVALID_EMPLOYER_KEY',
      });
      return;
    }

    const runId = await triggerPipeline(employerKey);
    if (!runId) {
      sendAlreadyRunning(res);
      return;
    }

    res.status(202).json({ started: true, runId });
  } catch (err) {
    next(err);
  }
});

scrapeRouter.post('/test', async (req, res, next) => {
  try {
    const employerKey = parseEmployerKey(req.body as Record<string, unknown> | undefined);

    if (employerKey === undefined || employerKey === null) {
      res.status(400).json({
        error: 'employerKey must be a non-empty string',
        code: 'INVALID_EMPLOYER_KEY',
      });
      return;
    }

    const runId = await triggerTestPipeline(employerKey);
    if (!runId) {
      sendAlreadyRunning(res);
      return;
    }

    res.status(202).json({ started: true, runId });
  } catch (err) {
    next(err);
  }
});

scrapeRouter.post('/control', async (req, res, next) => {
  try {
    const scheduledScrapingEnabled = parseScheduledScrapingEnabled(
      req.body as Record<string, unknown> | undefined,
    );

    if (scheduledScrapingEnabled === null) {
      res.status(400).json({
        error: 'scheduledScrapingEnabled must be a boolean',
        code: 'INVALID_SCRAPE_CONTROL',
      });
      return;
    }

    const controlState = setScheduledScrapingEnabled(scheduledScrapingEnabled);
    res.json(controlState);
  } catch (err) {
    next(err);
  }
});

scrapeRouter.get('/status', async (_req, res, next) => {
  try {
    const maxLimit = 50;
    const defaultLimit = 10;
    let limit = defaultLimit;

    const rawLimit = _req.query.limit;
    if (rawLimit !== undefined) {
      const candidate = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
      if (typeof candidate !== 'string') {
        res.status(400).json({
          error: 'Invalid limit parameter',
          code: 'INVALID_STATUS_LIMIT',
        });
        return;
      }

      const parsed = Number.parseInt(candidate, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxLimit) {
        res.status(400).json({
          error: 'Invalid limit parameter',
          code: 'INVALID_STATUS_LIMIT',
        });
        return;
      }

      limit = parsed;
    }

    const status = await getScrapeStatus(limit);
    res.json({
      ...status,
      ...getScrapeControlState(),
    });
  } catch (err) {
    next(err);
  }
});

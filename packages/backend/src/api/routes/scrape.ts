import { Router } from 'express';
import { triggerPipeline, getScrapeStatus } from '../../scrapers/pipeline.js';

export const scrapeRouter = Router();

scrapeRouter.post('/', async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown> | undefined;
    const employerKey = body?.employerKey;

    if (employerKey !== undefined && (typeof employerKey !== 'string' || employerKey.trim() === '')) {
      res.status(400).json({
        error: 'employerKey must be a non-empty string',
        code: 'INVALID_EMPLOYER_KEY',
      });
      return;
    }

    const runId = await triggerPipeline(typeof employerKey === 'string' ? employerKey.trim() : undefined);
    if (!runId) {
      res.status(409).json({
        error: 'Scrape already in progress',
        code: 'SCRAPE_ALREADY_RUNNING',
        started: false,
      });
      return;
    }
    res.status(202).json({ started: true, runId });
  } catch (err) {
    next(err);
  }
});

scrapeRouter.get('/status', async (_req, res) => {
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
  res.json(status);
});

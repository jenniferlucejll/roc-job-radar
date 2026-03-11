import { Router } from 'express';
import { triggerPipeline, getScrapeStatus } from '../../scrapers/pipeline.js';

export const scrapeRouter = Router();

scrapeRouter.post('/', (_req, res) => {
  const runId = triggerPipeline();
  if (!runId) {
    res.status(409).json({
      error: 'Scrape already in progress',
      code: 'SCRAPE_ALREADY_RUNNING',
      started: false,
    });
    return;
  }
  res.status(202).json({ started: true, runId });
});

scrapeRouter.get('/status', async (_req, res) => {
  const maxLimit = 50;
  const defaultLimit = 10;
  let limit = defaultLimit;

  const rawLimit = _req.query.limit;
  if (rawLimit !== undefined) {
    const parsed = Number.parseInt(Array.isArray(rawLimit) ? rawLimit[0] : rawLimit, 10);
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

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

scrapeRouter.get('/status', (_req, res) => {
  res.json(getScrapeStatus());
});

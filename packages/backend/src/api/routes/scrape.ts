import { Router } from 'express';
import { triggerPipeline, getScrapeStatus } from '../../scrapers/pipeline.js';

export const scrapeRouter = Router();

scrapeRouter.post('/', (_req, res) => {
  const started = triggerPipeline();
  if (!started) {
    res.status(409).json({ error: 'Scrape already in progress' });
    return;
  }
  res.status(202).json({ message: 'Scrape started' });
});

scrapeRouter.get('/status', (_req, res) => {
  res.json(getScrapeStatus());
});

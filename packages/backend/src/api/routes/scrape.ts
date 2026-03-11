import { Router } from 'express';

export const scrapeRouter = Router();

scrapeRouter.post('/', (_req, res) => {
  res.status(501).json({ error: 'Scraper not yet implemented' });
});

scrapeRouter.get('/status', (_req, res) => {
  res.json({ running: false });
});

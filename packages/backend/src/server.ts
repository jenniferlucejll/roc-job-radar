import express from 'express';
import { employersRouter } from './api/routes/employers.js';
import { jobsRouter } from './api/routes/jobs.js';
import { scrapeRouter } from './api/routes/scrape.js';
import { errorHandler } from './api/middleware/error.js';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/employers', employersRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/scrape', scrapeRouter);

  app.use(errorHandler);

  return app;
}

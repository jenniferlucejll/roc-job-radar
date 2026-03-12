import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { employersRouter } from './api/routes/employers.js';
import { jobsRouter } from './api/routes/jobs.js';
import { scrapeRouter } from './api/routes/scrape.js';
import { errorHandler } from './api/middleware/error.js';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 120,          // 120 requests/minute per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api', apiLimiter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/employers', employersRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/scrape', scrapeRouter);

  app.use(errorHandler);

  return app;
}

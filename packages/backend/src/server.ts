import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { employersRouter } from './api/routes/employers.js';
import { jobsRouter } from './api/routes/jobs.js';
import { scrapeRouter } from './api/routes/scrape.js';
import { errorHandler } from './api/middleware/error.js';
import { sqlClient } from './db/client.js';
import { getAiRuntimeStatus } from './startup/ensureOllama.js';

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

  app.get('/health/details', async (_req, res) => {
    const ai = getAiRuntimeStatus();

    try {
      const schemaProbe = await sqlClient<{ scrapeRuns: string | null }[]>`
        select to_regclass('public.scrape_runs') as "scrapeRuns"
      `;
      const scrapeRunsRelation = schemaProbe[0]?.scrapeRuns ?? null;
      res.json({
        status: 'ok',
        db: scrapeRunsRelation
          ? { status: 'ok' }
          : {
            status: 'bootstrap_required',
            error: 'Database migrations are still being applied.',
          },
        ai,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.json({
        status: 'ok',
        db: {
          status: 'error',
          error: message,
        },
        ai,
      });
    }
  });

  app.use('/api/employers', employersRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/scrape', scrapeRouter);

  app.use(errorHandler);

  return app;
}

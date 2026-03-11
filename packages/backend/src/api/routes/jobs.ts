import { Router } from 'express';
import { and, eq, isNull, isNotNull, gte, ilike, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { jobs } from '../../db/schema.js';

export const jobsRouter = Router();

jobsRouter.get('/', async (req, res, next) => {
  try {
    const { employer_id, status, new: isNew, q } = req.query;

    const conditions = [];

    if (employer_id) {
      conditions.push(eq(jobs.employerId, Number(employer_id)));
    }

    if (status === 'active' || status === undefined) {
      conditions.push(isNull(jobs.removedAt));
    } else if (status === 'removed') {
      conditions.push(isNotNull(jobs.removedAt));
    }
    // status === 'all' → no filter

    if (isNew === 'true' || isNew === '1') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      conditions.push(gte(jobs.firstSeenAt, sevenDaysAgo));
    }

    if (typeof q === 'string' && q.trim()) {
      conditions.push(ilike(jobs.title, `%${q.trim()}%`));
    }

    const rows = await db
      .select()
      .from(jobs)
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(jobs.firstSeenAt);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

jobsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid job id' });
      return;
    }

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!row) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
});

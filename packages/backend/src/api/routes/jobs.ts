import { Router } from 'express';
import { and, eq, isNull, isNotNull, gte, ilike, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { jobs } from '../../db/schema.js';

export const jobsRouter = Router();

jobsRouter.get('/', async (req, res, next) => {
  try {
    const { status, new: isNew, newHours, q } = req.query;
    const employerIdParam = req.query.employerId ?? req.query.employer_id;

    const conditions = [];
    if (typeof employerIdParam === 'string' && employerIdParam.length > 0) {
      const employerId = Number(employerIdParam);
      if (Number.isNaN(employerId)) {
        res.status(400).json({ error: 'Invalid employerId query parameter', code: 'INVALID_QUERY' });
        return;
      }
      conditions.push(eq(jobs.employerId, employerId));
    } else if (Array.isArray(employerIdParam)) {
      const employerId = Number(employerIdParam[0]);
      if (Number.isNaN(employerId)) {
        res.status(400).json({ error: 'Invalid employerId query parameter', code: 'INVALID_QUERY' });
        return;
      }
      conditions.push(eq(jobs.employerId, employerId));
    }

    if (status === 'active' || status === undefined) {
      conditions.push(isNull(jobs.removedAt));
    } else if (status === 'removed') {
      conditions.push(isNotNull(jobs.removedAt));
    }
    // status === 'all' → no filter

    const shouldFilterNew = isNew === 'true' || isNew === '1';
    if (shouldFilterNew) {
      let hours = 168;
      if (typeof newHours === 'string' && newHours.length > 0) {
        const parsed = Number(newHours);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          res.status(400).json({ error: 'Invalid newHours query parameter', code: 'INVALID_QUERY' });
          return;
        }
        hours = parsed;
      }
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      conditions.push(gte(jobs.firstSeenAt, cutoff));
    }

    if (typeof q === 'string' && q.trim()) {
      if (q.length > 200) {
        res.status(400).json({ error: 'Search query too long', code: 'INVALID_QUERY' });
        return;
      }
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
      res.status(400).json({ error: 'Invalid job id', code: 'INVALID_JOB_ID' });
      return;
    }

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!row) {
      res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
      return;
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { employers } from '../../db/schema.js';

export const employersRouter = Router();

employersRouter.get('/', async (req, res, next) => {
  try {
    const rawAll = req.query.all;
    const allParam = Array.isArray(rawAll) ? rawAll[0] : rawAll;
    const includeAll = allParam === 'true' || allParam === '1';

    const baseQuery = db.select().from(employers);
    const rows = includeAll
      ? await baseQuery.orderBy(employers.name)
      : await baseQuery.where(eq(employers.active, true)).orderBy(employers.name);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

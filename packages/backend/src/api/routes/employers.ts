import { Router } from 'express';
import { db } from '../../db/client.js';
import { employers } from '../../db/schema.js';

export const employersRouter = Router();

employersRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db.select().from(employers).orderBy(employers.name);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

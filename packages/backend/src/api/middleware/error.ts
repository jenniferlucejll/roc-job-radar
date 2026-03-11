import type { ErrorRequestHandler } from 'express';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const status = (err as { status?: number }).status ?? 500;
  const message = status < 500 ? (err as Error).message : 'Internal server error';
  res.status(status).json({ error: message });
};

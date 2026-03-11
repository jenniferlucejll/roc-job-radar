import type { ErrorRequestHandler } from 'express';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const status = (err as { status?: number }).status ?? 500;
  const message = status < 500 ? String((err as Error).message) : 'Internal server error';
  const code = (err as { code?: string }).code ?? (status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR');
  res.status(status).json({ error: message, code });
};

import type { ErrorRequestHandler } from 'express';

/**
 * Application errors with an explicit `status` and `code` are safe to surface
 * to the client as-is. All other errors get a generic message.
 */
interface AppError {
  status?: number;
  code?: string;
  message?: string;
  /** Mark as safe to expose the message to the client */
  expose?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const appErr = err as AppError;
  const status = appErr.status ?? 500;
  const isClientError = status >= 400 && status < 500;
  // Only expose the message when the error was deliberately thrown by application
  // code (has an explicit status) and is not a server error.
  const message =
    isClientError && appErr.expose === true
      ? String(appErr.message ?? 'Bad request')
      : isClientError
        ? 'Bad request'
        : 'Internal server error';
  const code = appErr.code ?? (isClientError ? 'BAD_REQUEST' : 'INTERNAL_ERROR');
  res.status(status).json({ error: message, code });
};

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const sqlProbe = vi.fn();
const getAiRuntimeStatus = vi.fn();

vi.mock('../../src/db/client.js', () => ({
  sqlClient: sqlProbe,
}));

vi.mock('../../src/startup/ensureOllama.js', () => ({
  getAiRuntimeStatus,
}));

vi.mock('../../src/api/routes/employers.js', () => ({
  employersRouter: express.Router(),
}));

vi.mock('../../src/api/routes/jobs.js', () => ({
  jobsRouter: express.Router(),
}));

vi.mock('../../src/api/routes/scrape.js', () => ({
  scrapeRouter: express.Router(),
}));

vi.mock('../../src/api/middleware/error.js', () => ({
  errorHandler: (
    err: unknown,
    _req: unknown,
    res: { status: (code: number) => { json: (payload: unknown) => unknown } },
    _next: unknown,
  ) => {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  },
}));

function getRouteHandler(path: string) {
  return async () => {
    const { createApp } = await import('../../src/server.js');
    const app = createApp();
    const router = (app as unknown as { _router?: { stack?: Array<{ route?: { path?: string; stack?: { handle: unknown }[] } }> } })._router;
    const layer = router?.stack?.find(
      (entry: { route?: { path?: string; stack?: { handle: unknown }[] } }) => entry.route?.path === path,
    );

    return layer?.route?.stack?.[0]?.handle as (
      req: Record<string, never>,
      res: { json: (payload: unknown) => unknown },
    ) => Promise<void> | void;
  };
}

describe('health routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps /health/details healthy while AI is degraded', async () => {
    sqlProbe.mockResolvedValueOnce([{ scrapeRuns: 'public.scrape_runs' }]);
    getAiRuntimeStatus.mockReturnValue({
      enabled: true,
      state: 'degraded',
      model: 'gemma3',
      apiReachable: false,
      modelAvailable: false,
      lastError: 'Timed out waiting for Ollama API',
      lastCheckedAt: '2026-03-13T00:00:00.000Z',
      lastReadyAt: null,
    });

    const handler = await getRouteHandler('/health/details')();
    const res = { json: vi.fn() };

    await handler({}, res);

    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      db: { status: 'ok' },
      ai: expect.objectContaining({
        state: 'degraded',
        lastError: 'Timed out waiting for Ollama API',
      }),
    });
  });

  it('reports bootstrap-required when the database is reachable but schema is not ready', async () => {
    sqlProbe.mockResolvedValueOnce([{ scrapeRuns: null }]);
    getAiRuntimeStatus.mockReturnValue({
      enabled: false,
      state: 'disabled',
      model: 'gemma3',
      apiReachable: null,
      modelAvailable: null,
      lastError: null,
      lastCheckedAt: '2026-03-13T00:00:00.000Z',
      lastReadyAt: null,
    });

    const handler = await getRouteHandler('/health/details')();
    const res = { json: vi.fn() };

    await handler({}, res);

    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      db: {
        status: 'bootstrap_required',
        error: 'Database migrations are still being applied.',
      },
      ai: expect.objectContaining({
        state: 'disabled',
      }),
    });
  });

  it('reports database probe errors without failing liveness', async () => {
    sqlProbe.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    getAiRuntimeStatus.mockReturnValue({
      enabled: false,
      state: 'disabled',
      model: 'gemma3',
      apiReachable: null,
      modelAvailable: null,
      lastError: null,
      lastCheckedAt: '2026-03-13T00:00:00.000Z',
      lastReadyAt: null,
    });

    const handler = await getRouteHandler('/health/details')();
    const res = { json: vi.fn() };

    await handler({}, res);

    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      db: {
        status: 'error',
        error: 'connect ECONNREFUSED',
      },
      ai: expect.objectContaining({
        state: 'disabled',
      }),
    });
  });
});

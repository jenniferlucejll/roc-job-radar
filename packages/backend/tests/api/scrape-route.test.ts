import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeRouter } from '../../src/api/routes/scrape.js';

vi.mock('../../src/scrapers/pipeline.js', () => ({
  triggerPipeline: vi.fn(),
  getScrapeStatus: vi.fn(async (limit: number) => ({
    running: false,
    runId: `run-${limit}`,
    lastStartedAt: '2026-03-11T00:00:00.000Z',
    lastResult: null,
    recentRuns: [],
  })),
}));

type Req = { query: Record<string, unknown> };

describe('scrape status route handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeResponse(): {
    res: { status: (code: number) => { json: (payload: unknown) => unknown };
    json: (payload: unknown) => unknown };
    statusCode: () => number;
  } {
    let statusCode = 200;
    const res: {
      status: (code: number) => { json: (payload: unknown) => unknown };
      json: (payload: unknown) => unknown;
    } = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: vi.fn(),
    };
    return { res, statusCode: () => statusCode };
  }

  function getStatusHandler() {
    const statusLayer = scrapeRouter.stack.find(
      (layer: { route?: { path?: string; stack?: { handle: unknown }[] } }) =>
        layer.route?.path === '/status',
    );
    const handler = statusLayer.route.stack[0].handle;
    return handler as (
      req: Req,
      res: { status: (code: number) => { json: (payload: unknown) => unknown }; json: (payload: unknown) => unknown },
      next: () => void,
    ) => Promise<unknown> | unknown;
  }

  it('returns invalid query error when limit exceeds maximum', async () => {
    const statusHandler = getStatusHandler();
    const req: Req = { query: { limit: '51' } };
    const { statusCode, res } = makeResponse();
    const next = vi.fn();

    await statusHandler(req, res, next);

    expect(statusCode()).toBe(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid limit parameter',
      code: 'INVALID_STATUS_LIMIT',
    });
  });

  it('passes validated limit to getScrapeStatus', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const getScrapeStatus = pipeline.getScrapeStatus as vi.Mock;

    const statusHandler = getStatusHandler();
    const req: Req = { query: { limit: '12' } };
    const { statusCode, res } = makeResponse();
    const next = vi.fn();

    await statusHandler(req, res, next);

    expect(statusCode()).toBe(200);
    expect(res.json).toHaveBeenCalledWith({
      running: false,
      runId: 'run-12',
      lastStartedAt: '2026-03-11T00:00:00.000Z',
      lastResult: null,
      recentRuns: [],
    });
    expect(getScrapeStatus).toHaveBeenCalledWith(12);
  });

  it('uses default limit when query is omitted', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const getScrapeStatus = pipeline.getScrapeStatus as vi.Mock;

    const statusHandler = getStatusHandler();
    const req: Req = { query: {} };
    const { statusCode, res } = makeResponse();
    const next = vi.fn();

    await statusHandler(req, res, next);

    expect(statusCode()).toBe(200);
    expect(res.json).toHaveBeenCalled();
    expect(getScrapeStatus).toHaveBeenCalledWith(10);
  });
});

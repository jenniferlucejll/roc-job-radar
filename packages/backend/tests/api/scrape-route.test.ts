import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeRouter } from '../../src/api/routes/scrape.js';

vi.mock('../../src/scrapers/pipeline.js', () => ({
  triggerPipeline: vi.fn(),
  triggerTestPipeline: vi.fn(),
  getScrapeStatus: vi.fn(async (limit: number) => ({
    running: false,
    runId: `run-${limit}`,
    lastStartedAt: '2026-03-11T00:00:00.000Z',
    lastResult: null,
    recentRuns: [],
    bootstrapState: 'ready',
    bootstrapMessage: null,
  })),
}));

vi.mock('../../src/scheduler.js', () => ({
  getScrapeControlState: vi.fn(() => ({
    scheduledScrapingEnabled: false,
    schedulerArmed: false,
    resetsOnRestart: true,
  })),
  setScheduledScrapingEnabled: vi.fn((enabled: boolean) => ({
    scheduledScrapingEnabled: enabled,
    schedulerArmed: enabled,
    resetsOnRestart: true,
  })),
}));

type PostReq = { body?: Record<string, unknown> };
type Req = { query: Record<string, unknown> };

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

function getRouteHandler(path: string) {
  const layer = scrapeRouter.stack.find(
    (entry: { route?: { path?: string; stack?: { handle: unknown }[] } }) =>
      entry.route?.path === path && entry.route.stack?.[0],
  );

  return layer!.route!.stack![0].handle as (
    req: PostReq | Req,
    res: { status: (code: number) => { json: (payload: unknown) => unknown }; json: (payload: unknown) => unknown },
    next: (err?: unknown) => void,
  ) => Promise<void>;
}

describe('scrape routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls triggerPipeline with undefined when no body is sent', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const triggerPipeline = pipeline.triggerPipeline as ReturnType<typeof vi.fn>;
    triggerPipeline.mockResolvedValue('run-1');

    const handler = getRouteHandler('/');
    const req: PostReq = { body: {} };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(202);
    expect(res.json).toHaveBeenCalledWith({ started: true, runId: 'run-1' });
    expect(triggerPipeline).toHaveBeenCalledWith(undefined);
  });

  it('calls triggerPipeline with employerKey when provided', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const triggerPipeline = pipeline.triggerPipeline as ReturnType<typeof vi.fn>;
    triggerPipeline.mockResolvedValue('run-2');

    const handler = getRouteHandler('/');
    const req: PostReq = { body: { employerKey: 'paychex' } };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(202);
    expect(res.json).toHaveBeenCalledWith({ started: true, runId: 'run-2' });
    expect(triggerPipeline).toHaveBeenCalledWith('paychex');
  });

  it('returns 409 when triggerPipeline returns null', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const triggerPipeline = pipeline.triggerPipeline as ReturnType<typeof vi.fn>;
    triggerPipeline.mockResolvedValue(null);

    const handler = getRouteHandler('/');
    const req: PostReq = { body: {} };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Scrape already in progress',
      code: 'SCRAPE_ALREADY_RUNNING',
      started: false,
    });
  });

  it('returns 400 when employerKey is invalid', async () => {
    const handler = getRouteHandler('/');
    const req: PostReq = { body: { employerKey: 42 } };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'employerKey must be a non-empty string',
      code: 'INVALID_EMPLOYER_KEY',
    });
  });

  it('calls triggerTestPipeline with employerKey for POST /test', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const triggerTestPipeline = pipeline.triggerTestPipeline as ReturnType<typeof vi.fn>;
    triggerTestPipeline.mockResolvedValue('test-run-1');

    const handler = getRouteHandler('/test');
    const req: PostReq = { body: { employerKey: 'paychex' } };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(202);
    expect(res.json).toHaveBeenCalledWith({ started: true, runId: 'test-run-1' });
    expect(triggerTestPipeline).toHaveBeenCalledWith('paychex');
  });

  it('returns 400 for POST /test when employerKey is missing', async () => {
    const handler = getRouteHandler('/test');
    const req: PostReq = { body: {} };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'employerKey must be a non-empty string',
      code: 'INVALID_EMPLOYER_KEY',
    });
  });

  it('returns 409 for POST /test when triggerTestPipeline returns null', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const triggerTestPipeline = pipeline.triggerTestPipeline as ReturnType<typeof vi.fn>;
    triggerTestPipeline.mockResolvedValue(null);

    const handler = getRouteHandler('/test');
    const req: PostReq = { body: { employerKey: 'paychex' } };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Scrape already in progress',
      code: 'SCRAPE_ALREADY_RUNNING',
      started: false,
    });
  });

  it('updates scheduled scraping state for POST /control', async () => {
    const scheduler = await import('../../src/scheduler.js');
    const setControl = scheduler.setScheduledScrapingEnabled as ReturnType<typeof vi.fn>;

    const handler = getRouteHandler('/control');
    const req: PostReq = { body: { scheduledScrapingEnabled: true } };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(200);
    expect(setControl).toHaveBeenCalledWith(true);
    expect(res.json).toHaveBeenCalledWith({
      scheduledScrapingEnabled: true,
      schedulerArmed: true,
      resetsOnRestart: true,
    });
  });

  it('returns 400 for POST /control when control value is invalid', async () => {
    const handler = getRouteHandler('/control');
    const req: PostReq = { body: {} };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'scheduledScrapingEnabled must be a boolean',
      code: 'INVALID_SCRAPE_CONTROL',
    });
  });

  it('returns invalid query error when limit exceeds maximum', async () => {
    const handler = getRouteHandler('/status');
    const req: Req = { query: { limit: '51' } };
    const { statusCode, res } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid limit parameter',
      code: 'INVALID_STATUS_LIMIT',
    });
  });

  it('passes validated limit to getScrapeStatus and includes control state', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const scheduler = await import('../../src/scheduler.js');
    const getScrapeStatus = pipeline.getScrapeStatus as vi.Mock;
    const getControlState = scheduler.getScrapeControlState as vi.Mock;

    const handler = getRouteHandler('/status');
    const req: Req = { query: { limit: '12' } };
    const { statusCode, res } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(200);
    expect(getScrapeStatus).toHaveBeenCalledWith(12);
    expect(getControlState).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      running: false,
      runId: 'run-12',
      lastStartedAt: '2026-03-11T00:00:00.000Z',
      lastResult: null,
      recentRuns: [],
      bootstrapState: 'ready',
      bootstrapMessage: null,
      scheduledScrapingEnabled: false,
      schedulerArmed: false,
      resetsOnRestart: true,
    });
  });

  it('passes non-bootstrap status errors to next for GET /status', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const getScrapeStatus = pipeline.getScrapeStatus as vi.Mock;
    const error = new Error('database offline');

    getScrapeStatus.mockRejectedValueOnce(error);

    const handler = getRouteHandler('/status');
    const req: Req = { query: {} };
    const { res, statusCode } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(statusCode()).toBe(200);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});

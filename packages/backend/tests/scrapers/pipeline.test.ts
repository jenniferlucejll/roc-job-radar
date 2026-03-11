import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyRecord = Record<string, unknown>;

const queryResults: AnyRecord[][] = [];
const dbInsertCalls: AnyRecord[] = [];

function enqueueQueryResults(results: AnyRecord[][]): void {
  queryResults.length = 0;
  queryResults.push(...results);
}

function createSelectChain(result: unknown): unknown {
  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
  };

  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason?: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  chain.catch = (onRejected: (reason?: unknown) => unknown) => Promise.resolve(result).catch(onRejected);
  chain.finally = (onFinally: () => void) => Promise.resolve(result).finally(onFinally);

  return chain;
}

function createMutationChain(): { then: unknown; catch: unknown; finally: unknown } {
  return {
    then: (_resolve: (value: unknown) => unknown, _reject?: (reason?: unknown) => unknown) =>
      Promise.resolve(undefined),
    catch: (onRejected: (reason?: unknown) => unknown) => Promise.resolve(undefined).catch(onRejected),
    finally: (onFinally: () => void) => Promise.resolve(undefined).finally(onFinally),
  };
}

function createDbUpdateChain() {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => createMutationChain()),
    })),
  };
}

const db = {
  select: vi.fn(() => {
    const nextResult = queryResults.shift() ?? [];
    return createSelectChain(nextResult);
  }),
  insert: vi.fn(() => ({
    values: (values: AnyRecord | AnyRecord[]) => {
      dbInsertCalls.push(
        Array.isArray(values) ? values : [values],
      );
      return Promise.resolve(undefined);
    },
  })),
  update: vi.fn(() => createDbUpdateChain()),
  delete: vi.fn(() => ({
    where: vi.fn(() => createMutationChain()),
  })),
};

vi.mock('../../src/db/client.js', () => ({ db }));
vi.mock('../../src/config.js', () => ({
  config: {
    scraper: {
      userAgent: 'test-agent',
      timeoutMs: 1000,
    },
  },
}));
vi.mock('../../src/scrapers/robots.js', () => ({
  checkRobots: vi.fn().mockResolvedValue(true),
}));

describe('pipeline status hydration', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    queryResults.length = 0;
    dbInsertCalls.length = 0;
  });

  it('hydrates lastResult and employer details from DB after restart', async () => {
    const { getScrapeStatus } = await import('../../src/scrapers/pipeline.js');

    enqueueQueryResults([
      [],
      [
        {
          runId: 'run-2026-03-11',
          status: 'partial_error',
          startedAt: new Date('2026-03-11T00:00:00.000Z'),
          finishedAt: new Date('2026-03-11T00:01:00.000Z'),
          durationMs: 60000,
          employersRun: 2,
          jobsInserted: 3,
          jobsUpdated: 1,
          jobsRemoved: 0,
          errors: 2,
          requestAttempts: 8,
          retryAttempts: 3,
          openErrors: 1,
        },
      ],
      [
        {
          employerId: 1,
          status: 'error',
          jobsScraped: 12,
          jobsFiltered: 9,
          jobsInserted: 2,
          jobsUpdated: 1,
          jobsRemoved: 0,
          requestAttempts: 4,
          retryAttempts: 1,
          unresolvedErrors: 1,
          errors: '[{"errorType":"missing_adapter","message":"No adapter"},{"not-object":true}]',
          employerName: 'Paychex',
          employerKey: 'paychex',
        },
        {
          employerId: 2,
          status: 'robots_blocked',
          jobsScraped: 0,
          jobsFiltered: 0,
          jobsInserted: 0,
          jobsUpdated: 0,
          jobsRemoved: 0,
          requestAttempts: 1,
          retryAttempts: 0,
          unresolvedErrors: 0,
          errors: '[]',
          employerName: 'Wegmans',
          employerKey: 'wegmans',
        },
      ],
      [
        {
          runId: 'run-2026-03-11',
          status: 'partial_error',
          startedAt: new Date('2026-03-11T00:00:00.000Z'),
          finishedAt: new Date('2026-03-11T00:01:00.000Z'),
          durationMs: 60000,
          employersRun: 2,
          jobsInserted: 3,
          jobsUpdated: 1,
          jobsRemoved: 0,
          errors: 2,
          requestAttempts: 8,
          retryAttempts: 3,
          openErrors: 1,
        },
      ],
    ]);

    const status = await getScrapeStatus(10);

    expect(db.select).toHaveBeenCalledTimes(4);
    expect(status.running).toBe(false);
    expect(status.runId).toBe('run-2026-03-11');
    expect(status.lastResult).not.toBeNull();
    expect(status.lastResult?.runId).toBe('run-2026-03-11');
    expect(status.lastResult?.employers).toHaveLength(2);
    expect(status.lastResult?.employers?.[0]?.errors).toEqual([
      { errorType: 'missing_adapter', message: 'No adapter' },
    ]);
    expect(status.lastResult?.employers?.[1]?.status).toBe('robots_blocked');
    expect(status.lastResult?.employers?.[1]?.errors).toEqual([]);
    expect(status.recentRuns).toHaveLength(1);
  });

  it('uses running DB row when available and reports startedAt from it', async () => {
    const { getScrapeStatus } = await import('../../src/scrapers/pipeline.js');

    enqueueQueryResults([
      [
        {
          runId: 'run-live',
          startedAt: new Date('2026-03-11T00:05:00.000Z'),
        },
      ],
      [],
      [],
    ]);

    const status = await getScrapeStatus(5);

    expect(status.running).toBe(true);
    expect(status.runId).toBe('run-live');
    expect(status.lastStartedAt).toBe('2026-03-11T00:05:00.000Z');
    expect(status.lastResult).toBeNull();
  });

  it('falls back to empty lastResult when no completed runs exist', async () => {
    const { getScrapeStatus } = await import('../../src/scrapers/pipeline.js');

    enqueueQueryResults([[], [], []]);

    const status = await getScrapeStatus(5);

    expect(status.running).toBe(false);
    expect(status.lastResult).toBeNull();
    expect(status.recentRuns).toHaveLength(0);
  });

});

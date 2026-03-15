import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyRecord = Record<string, unknown>;

const queryResults: AnyRecord[][] = [];
const dbInsertCalls: AnyRecord[] = [];
const dbUpdateCalls: AnyRecord[] = [];

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

function createRejectedSelectChain(error: unknown): unknown {
  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
  };

  chain.then = (_resolve: (value: unknown) => unknown, reject?: (reason?: unknown) => unknown) =>
    Promise.reject(error).then(undefined, reject);
  chain.catch = (onRejected: (reason?: unknown) => unknown) => Promise.reject(error).catch(onRejected);
  chain.finally = (onFinally: () => void) => Promise.reject(error).finally(onFinally);

  return chain;
}

function createMutationChain(): { then: unknown; catch: unknown; finally: unknown } {
  return {
    then: (resolve: (value: unknown) => unknown, reject?: (reason?: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve, reject),
    catch: (onRejected: (reason?: unknown) => unknown) => Promise.resolve(undefined).catch(onRejected),
    finally: (onFinally: () => void) => Promise.resolve(undefined).finally(onFinally),
  };
}

function createDbUpdateChain() {
  return {
    set: vi.fn((values: AnyRecord) => {
      dbUpdateCalls.push(values);
      return {
      where: vi.fn(() => createMutationChain()),
      };
    }),
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
    dbUpdateCalls.length = 0;
  });

  it('hydrates lastResult and employer details from DB after restart', async () => {
    const { getScrapeStatus } = await import('../../src/scrapers/pipeline.js');

    enqueueQueryResults([
      [],
      [
        {
          runId: 'run-2026-03-11',
          runType: 'normal',
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
          runType: 'normal',
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
    expect(status.lastResult?.runType).toBe('normal');
    expect(status.lastResult?.employers).toHaveLength(2);
    expect(status.lastResult?.employers?.[0]?.errors).toEqual([
      { errorType: 'missing_adapter', message: 'No adapter' },
    ]);
    expect(status.lastResult?.employers?.[1]?.status).toBe('robots_blocked');
    expect(status.lastResult?.employers?.[1]?.errors).toEqual([]);
    expect(status.recentRuns).toHaveLength(1);
    expect(status.recentRuns[0]?.runType).toBe('normal');
    expect(status.bootstrapState).toBe('ready');
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
    expect(status.bootstrapState).toBe('ready');
  });

  it('falls back to empty lastResult when no completed runs exist', async () => {
    const { getScrapeStatus } = await import('../../src/scrapers/pipeline.js');

    enqueueQueryResults([[], [], []]);

    const status = await getScrapeStatus(5);

    expect(status.running).toBe(false);
    expect(status.lastResult).toBeNull();
    expect(status.recentRuns).toHaveLength(0);
    expect(status.bootstrapState).toBe('ready');
  });

  it('returns bootstrap-safe status when scrape tables are not ready yet', async () => {
    const { getScrapeStatus } = await import('../../src/scrapers/pipeline.js');
    const missingRelationError = Object.assign(
      new Error('relation "scrape_runs" does not exist'),
      { code: '42P01' },
    );

    db.select.mockImplementationOnce(() => createRejectedSelectChain(missingRelationError));

    const status = await getScrapeStatus(5);

    expect(status).toEqual({
      running: false,
      lastResult: null,
      lastStartedAt: null,
      runId: null,
      recentRuns: [],
      bootstrapState: 'migrating',
      bootstrapMessage: 'Database migrations are still being applied. Scrape status will be available shortly.',
    });
  });

  it('returns bootstrap-safe status when scrape status joins are not ready yet', async () => {
    const { getScrapeStatus } = await import('../../src/scrapers/pipeline.js');
    const missingRelationError = Object.assign(
      new Error('relation "scrape_run_employers" does not exist'),
      { code: '42P01' },
    );

    enqueueQueryResults([
      [],
      [
        {
          runId: 'run-2026-03-11',
          runType: 'normal',
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
    db.select.mockImplementationOnce(() => createSelectChain([]));
    db.select.mockImplementationOnce(() => createSelectChain(queryResults.shift() ?? []));
    db.select.mockImplementationOnce(() => createRejectedSelectChain(missingRelationError));

    const status = await getScrapeStatus(5);

    expect(status).toEqual({
      running: false,
      lastResult: null,
      lastStartedAt: null,
      runId: null,
      recentRuns: [],
      bootstrapState: 'migrating',
      bootstrapMessage: 'Database migrations are still being applied. Scrape status will be available shortly.',
    });
  });

  it('skips stale run cleanup quietly when scrape schema is not ready', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const missingRelationError = Object.assign(
      new Error('relation "public.scrape_run_employers" does not exist'),
      { code: '42P01' },
    );

    db.update.mockImplementationOnce(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.reject(missingRelationError)),
      })),
    }));

    await pipeline.clearStaleRunningRuns();

    expect(logSpy).toHaveBeenCalledWith(
      '[pipeline] scrape schema not ready yet; skipping stale scrape run cleanup',
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      '[pipeline] failed to cleanup stale scrape runs:',
      expect.anything(),
    );
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

});

describe('pipeline execution modes', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    queryResults.length = 0;
    dbInsertCalls.length = 0;
    dbUpdateCalls.length = 0;
  });

  it('runs test scrapes against the first 3 raw jobs and skips soft removals', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');
    let receivedMaxJobs: number | undefined;

    pipeline.registerAdapter({
      employerKey: 'paychex',
      scrape: vi.fn(async (context) => {
        receivedMaxJobs = context?.maxJobs;
        return [
          {
            externalId: 'ext-1',
            title: 'Existing job',
            url: 'https://example.com/jobs/1',
            location: 'Rochester, NY',
          },
          {
            externalId: 'ext-2',
            title: 'Buffalo job',
            url: 'https://example.com/jobs/2',
            location: 'Buffalo, NY',
          },
          {
            externalId: 'ext-3',
            title: 'Remote job',
            url: 'https://example.com/jobs/3',
            location: 'Remote',
          },
          {
            externalId: 'ext-4',
            title: 'Ignored fourth job',
            url: 'https://example.com/jobs/4',
            location: 'Rochester, NY',
          },
        ];
      }),
    });

    enqueueQueryResults([
      [
        {
          id: 1,
          key: 'paychex',
          name: 'Paychex',
          active: true,
          careerUrl: 'https://example.com/careers',
        },
      ],
      [
        {
          id: 10,
          externalId: 'ext-1',
          url: 'https://example.com/jobs/1',
          title: 'Existing job',
          location: 'Rochester, NY',
          remoteStatus: null,
          department: null,
          descriptionHtml: null,
          salaryRaw: null,
          salaryNormalizedRaw: null,
          salaryNormalizedMin: null,
          salaryNormalizedMax: null,
          salaryCurrency: null,
          salaryPeriod: null,
          requirementsText: null,
          requirementsHtml: null,
          responsibilitiesText: null,
          responsibilitiesHtml: null,
          summaryText: null,
          normalizedDescriptionText: null,
          normalizedDescriptionHtml: null,
          aiProvider: null,
          aiModel: null,
          aiNormalizedAt: null,
          aiWarnings: null,
          aiPayload: null,
          datePostedAt: null,
          removedAt: null,
        },
        {
          id: 11,
          externalId: 'legacy-job',
          url: 'https://example.com/jobs/legacy',
          title: 'Legacy job',
          location: 'Rochester, NY',
          remoteStatus: null,
          department: null,
          descriptionHtml: null,
          salaryRaw: null,
          salaryNormalizedRaw: null,
          salaryNormalizedMin: null,
          salaryNormalizedMax: null,
          salaryCurrency: null,
          salaryPeriod: null,
          requirementsText: null,
          requirementsHtml: null,
          responsibilitiesText: null,
          responsibilitiesHtml: null,
          summaryText: null,
          normalizedDescriptionText: null,
          normalizedDescriptionHtml: null,
          aiProvider: null,
          aiModel: null,
          aiNormalizedAt: null,
          aiWarnings: null,
          aiPayload: null,
          datePostedAt: null,
          removedAt: null,
        },
      ],
      [],
    ]);

    const result = await pipeline.runPipelineForTesting({
      runId: 'test-run-1',
      employerKey: 'paychex',
      runType: 'test',
      maxJobs: 3,
      persistenceMode: 'upsert_only',
      applyLocationFilter: false,
    });

    expect(result.runType).toBe('test');
    expect(result.jobsInserted).toBe(2);
    expect(result.jobsUpdated).toBe(1);
    expect(result.jobsRemoved).toBe(0);
    expect(result.employers[0]?.jobsScraped).toBe(3);
    expect(result.employers[0]?.jobsFiltered).toBe(3);
    expect(receivedMaxJobs).toBe(3);

    const insertedRows = dbInsertCalls.flat();
    expect(insertedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ runId: 'test-run-1', runType: 'test' }),
      expect.objectContaining({ employerId: 1, externalId: 'ext-2', location: 'Buffalo, NY' }),
      expect.objectContaining({ employerId: 1, externalId: 'ext-3', location: 'Remote' }),
    ]));
    expect(insertedRows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ employerId: 1, externalId: 'ext-4' }),
    ]));
    expect(dbUpdateCalls).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ removedAt: expect.any(Date) }),
    ]));
  });

  it('does not populate legacy AI fields during ingestion', async () => {
    const pipeline = await import('../../src/scrapers/pipeline.js');

    pipeline.registerAdapter({
      employerKey: 'wegmans',
      scrape: vi.fn(async () => ([
        {
          externalId: 'ext-1',
          title: 'Software Engineer',
          url: 'https://example.com/jobs/1',
          location: 'Rochester, NY',
          descriptionHtml: '<p>Build software</p>',
        },
        {
          externalId: 'ext-2',
          title: 'QA Engineer',
          url: 'https://example.com/jobs/2',
          location: 'Rochester, NY',
          descriptionHtml: '<p>Test software</p>',
        },
      ])),
    });

    enqueueQueryResults([
      [
        {
          id: 2,
          key: 'wegmans',
          name: 'Wegmans',
          active: true,
          careerUrl: 'https://example.com/careers',
        },
      ],
      [],
      [],
    ]);

    const result = await pipeline.runPipelineForTesting({
      runId: 'normal-run-1',
      employerKey: 'wegmans',
      runType: 'normal',
      persistenceMode: 'full_reconcile',
      applyLocationFilter: true,
    });

    expect(result.jobsInserted).toBe(2);
    expect(dbInsertCalls.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: 'ext-1',
        salaryNormalizedRaw: null,
        salaryNormalizedMin: null,
        salaryNormalizedMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        summaryText: null,
        aiProvider: null,
        aiModel: null,
        aiNormalizedAt: null,
        aiWarnings: null,
        aiPayload: null,
      }),
    ]));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { employersRouter } from '../../src/api/routes/employers.js';

const rowsFixture = [
  { id: 1, name: 'A Employer', active: true },
  { id: 2, name: 'B Employer', active: false },
];

const queryChain = {
  from: vi.fn(() => queryChain),
  where: vi.fn(() => queryChain),
  orderBy: vi.fn(async () => rowsFixture),
};

vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => queryChain),
  },
}));

vi.mock('../../src/db/schema.js', () => ({
  employers: {
    active: Symbol('active'),
    name: Symbol('name'),
  },
}));

type Req = { query: Record<string, unknown> };

describe('employers route handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeResponse(): {
    res: { json: (payload: unknown) => unknown };
  } {
    const res: { json: (payload: unknown) => unknown } = {
      json: vi.fn(),
    };
    return { res };
  }

  function getListHandler() {
    const layer = employersRouter.stack.find(
      (stackLayer: { route?: { path?: string; stack?: { handle: unknown }[] } }) =>
        stackLayer.route?.path === '/',
    );
    const handler = layer?.route?.stack?.[0]?.handle;
    return handler as (
      req: Req,
      res: { json: (payload: unknown) => unknown },
      next: (err?: unknown) => void,
    ) => Promise<unknown>;
  }

  it('returns only active employers by default', async () => {
    const handler = getListHandler();
    const req: Req = { query: {} };
    const { res } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(queryChain.where).toHaveBeenCalledTimes(1);
    expect(queryChain.orderBy).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(rowsFixture);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns all employers when all=true', async () => {
    const handler = getListHandler();
    const req: Req = { query: { all: 'true' } };
    const { res } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(queryChain.where).not.toHaveBeenCalled();
    expect(queryChain.orderBy).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(rowsFixture);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns all employers when all=1', async () => {
    const handler = getListHandler();
    const req: Req = { query: { all: '1' } };
    const { res } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(queryChain.where).not.toHaveBeenCalled();
    expect(queryChain.orderBy).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(rowsFixture);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses first all value when query key is repeated', async () => {
    const handler = getListHandler();
    const req: Req = { query: { all: ['true', 'false'] } };
    const { res } = makeResponse();
    const next = vi.fn();

    await handler(req, res, next);

    expect(queryChain.where).not.toHaveBeenCalled();
    expect(queryChain.orderBy).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(rowsFixture);
    expect(next).not.toHaveBeenCalled();
  });
});

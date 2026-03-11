import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('requestThrottle', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits at least the configured interval in production mode', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const { createRequestThrottler } = await import('../../src/scrapers/requestThrottle.js');

    vi.useFakeTimers();
    const throttler = createRequestThrottler(100);

    const first = throttler.waitForNextSlot();
    await first;

    let secondResolved = false;
    const second = throttler.waitForNextSlot().then(() => {
      secondResolved = true;
    });

    vi.advanceTimersByTime(99);
    await Promise.resolve();
    expect(secondResolved).toBe(false);

    vi.advanceTimersByTime(1);
    await second;
    expect(secondResolved).toBe(true);

    vi.useRealTimers();
    delete process.env.NODE_ENV;
    vi.resetModules();
  });

  it('bypasses waiting in test mode', async () => {
    process.env.NODE_ENV = 'test';
    vi.resetModules();

    const { createRequestThrottler, sleep } = await import('../../src/scrapers/requestThrottle.js');

    const start = Date.now();
    const throttler = createRequestThrottler(100);
    await throttler.waitForNextSlot();
    await throttler.waitForNextSlot();
    expect(Date.now() - start).toBeLessThan(10);

    const sleepStart = Date.now();
    await sleep(100);
    expect(Date.now() - sleepStart).toBeLessThan(10);

    delete process.env.NODE_ENV;
    vi.resetModules();
  });
});

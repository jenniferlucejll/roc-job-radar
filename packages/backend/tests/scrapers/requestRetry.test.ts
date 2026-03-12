import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithRetry } from '../../src/scrapers/requestRetry.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithRetry', () => {
  it('retries transient failures and eventually succeeds', async () => {
    const mockResponses = [
      { ok: false, status: 500 },
      { ok: false, status: 502 },
      { ok: true, json: async () => ({ ok: true }) },
    ];
    const attempts: Array<{ attempt: number; maxAttempts: number; url: string }> = [];

    const fetchMock = vi.fn().mockImplementation(async () => {
      const current = mockResponses.shift();
      if (!current) {
        return { ok: true, json: async () => ({}) };
      }
      return current as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchWithRetry('https://example.com', async (res) => (await res.json()) as { ok: boolean }, {
      timeoutMs: 1000,
      maxAttempts: 3,
      baseDelayMs: 10,
      onAttempt: (info) => attempts.push(info),
    });

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(attempts).toEqual([
      { attempt: 1, maxAttempts: 3, url: 'https://example.com' },
      { attempt: 2, maxAttempts: 3, url: 'https://example.com' },
      { attempt: 3, maxAttempts: 3, url: 'https://example.com' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable statuses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithRetry('https://example.com', async (res) => res.text(), {
      timeoutMs: 1000,
      maxAttempts: 3,
      baseDelayMs: 10,
    })).rejects.toThrow('status 400');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const p = fetchWithRetry('https://example.com', async (res) => res.text(), {
      timeoutMs: 1000,
      maxAttempts: 2,
      baseDelayMs: 10,
    });

    await expect(p).rejects.toThrow('status 500');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on "terminated" network error and eventually succeeds', async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new TypeError('terminated');
      return { ok: true, json: async () => ({ done: true }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWithRetry('https://example.com', async (res) => (await res.json()) as { done: boolean }, {
      timeoutMs: 1000,
      maxAttempts: 3,
      baseDelayMs: 10,
    });

    expect(result).toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

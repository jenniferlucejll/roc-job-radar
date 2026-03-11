import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRobots, isPathAllowed, clearRobotsCache } from '../../src/scrapers/robots.js';

beforeEach(() => {
  clearRobotsCache();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// isPathAllowed (pure parser — no I/O)
// ---------------------------------------------------------------------------

describe('isPathAllowed', () => {
  it('allows everything when robots.txt is empty', () => {
    expect(isPathAllowed('', '/careers')).toBe(true);
  });

  it('allows path not covered by any Disallow', () => {
    const content = 'User-agent: *\nDisallow: /admin/\n';
    expect(isPathAllowed(content, '/careers')).toBe(true);
  });

  it('disallows path matching a Disallow rule', () => {
    const content = 'User-agent: *\nDisallow: /careers\n';
    expect(isPathAllowed(content, '/careers')).toBe(false);
  });

  it('disallows everything when Disallow is /', () => {
    const content = 'User-agent: *\nDisallow: /\n';
    expect(isPathAllowed(content, '/careers/jobs')).toBe(false);
  });

  it('allows when Allow is more specific than Disallow', () => {
    const content = 'User-agent: *\nDisallow: /careers\nAllow: /careers/jobs\n';
    expect(isPathAllowed(content, '/careers/jobs')).toBe(true);
  });

  it('ignores rules in non-wildcard user-agent blocks', () => {
    const content = 'User-agent: Googlebot\nDisallow: /careers\n';
    expect(isPathAllowed(content, '/careers')).toBe(true);
  });

  it('strips inline comments', () => {
    const content = 'User-agent: * # all bots\nDisallow: /private # secret\n';
    expect(isPathAllowed(content, '/private')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkRobots (uses fetch — mocked)
// ---------------------------------------------------------------------------

describe('checkRobots', () => {
  function mockFetch(status: number, body: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        text: async () => body,
      }),
    );
  }

  it('returns true when robots.txt allows the path', async () => {
    mockFetch(200, 'User-agent: *\nDisallow: /admin\n');
    expect(await checkRobots('https://example.com/careers', 'test-agent')).toBe(true);
  });

  it('returns false when robots.txt disallows the path', async () => {
    mockFetch(200, 'User-agent: *\nDisallow: /careers\n');
    expect(await checkRobots('https://example.com/careers', 'test-agent')).toBe(false);
  });

  it('returns true (fail open) when robots.txt returns 404', async () => {
    mockFetch(404, '');
    expect(await checkRobots('https://example.com/careers', 'test-agent')).toBe(true);
  });

  it('returns true (fail open) when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    expect(await checkRobots('https://example.com/careers', 'test-agent')).toBe(true);
  });

  it('caches the result and only fetches once for repeated calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await checkRobots('https://example.com/careers', 'test-agent');
    await checkRobots('https://example.com/careers/jobs', 'test-agent');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches again after cache is cleared', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await checkRobots('https://example.com/careers', 'test-agent');
    clearRobotsCache();
    await checkRobots('https://example.com/careers', 'test-agent');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

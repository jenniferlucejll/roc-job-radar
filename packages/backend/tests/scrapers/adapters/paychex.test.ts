import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

const fixture = JSON.parse(readFileSync(join(fixturesDir, 'paychex-jobs.json'), 'utf8'));

beforeEach(() => {
  vi.restoreAllMocks();
});

vi.mock('../../../src/config.js', () => ({
  config: {
    scraper: { userAgent: 'test-agent', timeoutMs: 5000 },
  },
}));

const { paychexScraper } = await import('../../../src/scrapers/adapters/paychex.js');

describe('PaychexScraper', () => {
  it('has the correct employerKey', () => {
    expect(paychexScraper.employerKey).toBe('paychex');
  });

  it('maps Jibe jobs to ScrapedJob correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }),
    );

    const jobs = await paychexScraper.scrape();

    expect(jobs).toHaveLength(2);

    const [first] = jobs;
    expect(first.externalId).toBe('R5001');
    expect(first.title).toBe('Software Engineer');
    expect(first.url).toBe('https://careers.paychex.com/careers/job/R5001');
    expect(first.location).toBe('Rochester, NY, United States');
    expect(first.department).toBe('Technology');
    expect(first.descriptionHtml).toBe('<p>Build great software at Paychex.</p>');
    expect(first.remoteStatus).toBe('hybrid');
    expect(first.salaryRaw).toBe('$90,000 - $120,000');
    expect(first.datePostedAt).toBeInstanceOf(Date);
  });

  it('maps On-Site tag to remoteStatus onsite', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }),
    );

    const jobs = await paychexScraper.scrape();
    expect(jobs[1].remoteStatus).toBe('onsite');
  });

  it('sets salaryRaw to undefined when salary_value is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }),
    );

    const jobs = await paychexScraper.scrape();
    expect(jobs[1].salaryRaw).toBeUndefined();
  });

  it('returns empty array when jobs list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jobs: [], totalCount: 0, count: 0 }),
      }),
    );

    const jobs = await paychexScraper.scrape();
    expect(jobs).toHaveLength(0);
  });

  it('uses GET with correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [], totalCount: 0, count: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await paychexScraper.scrape();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://careers.paychex.com/api/jobs',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'test-agent' }) }),
    );
    // GET request has no 'method' override (defaults to GET)
    const callArgs = fetchMock.mock.calls[0][1] as RequestInit;
    expect(callArgs.method).toBeUndefined();
  });

  it('throws when the API returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(paychexScraper.scrape()).rejects.toThrow('503');
  });
});

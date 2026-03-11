import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

const singlePage = JSON.parse(readFileSync(join(fixturesDir, 'workday-single-page.json'), 'utf8'));
const page1 = JSON.parse(readFileSync(join(fixturesDir, 'workday-page1.json'), 'utf8'));
const page2 = JSON.parse(readFileSync(join(fixturesDir, 'workday-page2.json'), 'utf8'));

beforeEach(() => {
  vi.restoreAllMocks();
});

// Minimal config mock so the adapter can import config.ts without a real DB env.
vi.mock('../../../src/config.js', () => ({
  config: {
    scraper: { userAgent: 'test-agent', timeoutMs: 5000 },
  },
}));

const { universityOfRochesterScraper } = await import(
  '../../../src/scrapers/adapters/university-of-rochester.js'
);

describe('UniversityOfRochesterScraper', () => {
  it('has the correct employerKey', () => {
    expect(universityOfRochesterScraper.employerKey).toBe('university-of-rochester');
  });

  it('maps Workday postings to ScrapedJob correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => singlePage }),
    );

    const jobs = await universityOfRochesterScraper.scrape();

    expect(jobs).toHaveLength(2);

    const [first] = jobs;
    expect(first.externalId).toBe('R00001');
    expect(first.title).toBe('Software Engineer');
    expect(first.url).toBe(
      'https://rochester.wd5.myworkdayjobs.com/en-US/job/Rochester-NY/Software-Engineer_R00001',
    );
    expect(first.location).toBe('Rochester, NY, United States of America');
    expect(first.department).toBeUndefined(); // department not available from Workday listing API
  });

  it('paginates until all jobs are fetched', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await universityOfRochesterScraper.scrape();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(3);
    expect(jobs[2].externalId).toBe('R00003');
  });

  it('returns empty array when total is 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jobPostings: [], total: 0 }) }),
    );

    const jobs = await universityOfRochesterScraper.scrape();
    expect(jobs).toHaveLength(0);
  });

  it('uses POST with correct URL and Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobPostings: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await universityOfRochesterScraper.scrape();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://rochester.wd5.myworkdayjobs.com/wday/cxs/rochester/UR_Staff/jobs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('throws when the API returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    await expect(universityOfRochesterScraper.scrape()).rejects.toThrow('500');
  });
});

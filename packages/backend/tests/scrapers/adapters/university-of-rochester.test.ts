import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

const singlePage = JSON.parse(readFileSync(join(fixturesDir, 'workday-single-page.json'), 'utf8'));

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
  function posting(id: string) {
    return {
      title: `Role ${id}`,
      externalPath: `/job/Rochester-NY/Role-${id}_${id}`,
      locationsText: 'Rochester, NY, United States of America',
    };
  }

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
    const page1Payload = {
      total: 21,
      jobPostings: Array.from({ length: 20 }, (_, i) => posting(`R1${String(i).padStart(2, '0')}`)),
    };
    const page2Payload = {
      total: 21,
      jobPostings: [posting('R200')],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1Payload })
      .mockResolvedValueOnce({ ok: true, json: async () => page2Payload });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await universityOfRochesterScraper.scrape();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(21);
    expect(jobs.at(-1)?.externalId).toBe('R200');
  });

  it('continues paginating when Workday returns total=0 after page 1', async () => {
    const page1Payload = {
      total: 1310,
      jobPostings: Array.from({ length: 20 }, (_, i) => posting(`R1${String(i).padStart(2, '0')}`)),
    };
    const page2Payload = {
      total: 0,
      jobPostings: Array.from({ length: 20 }, (_, i) => posting(`R2${String(i).padStart(2, '0')}`)),
    };
    const page3Payload = {
      total: 0,
      jobPostings: [posting('R300')],
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1Payload })
      .mockResolvedValueOnce({ ok: true, json: async () => page2Payload })
      .mockResolvedValueOnce({ ok: true, json: async () => page3Payload });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await universityOfRochesterScraper.scrape();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(jobs).toHaveLength(41);
    expect(jobs.at(-1)?.externalId).toBe('R300');
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

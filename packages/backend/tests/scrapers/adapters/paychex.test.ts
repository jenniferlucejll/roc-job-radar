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
    expect(first.url).toBe('https://careers-paychex.icims.com/jobs/R5001/login');
    expect(first.location).toBe('Rochester, NY, United States');
    expect(first.department).toBe('Technology');
    expect(first.descriptionHtml).toBe('<p>Build great software at Paychex.</p>');
    expect(first.remoteStatus).toBe('hybrid');
    expect(first.salaryRaw).toBe('95000');
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

  it('sets department to undefined when department is empty string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }),
    );

    const jobs = await paychexScraper.scrape();
    expect(jobs[1].department).toBeUndefined();
  });

  it('sets salaryRaw to undefined when salary_value is 0', async () => {
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

  it('uses GET with Rochester-scoped URL params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [], totalCount: 0, count: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await paychexScraper.scrape();

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(firstUrl.origin + firstUrl.pathname).toBe('https://careers.paychex.com/api/jobs');
    expect(firstUrl.searchParams.get('city')).toBe('Rochester');
    expect(firstUrl.searchParams.get('state')).toBe('New York');
    expect(firstUrl.searchParams.get('page')).toBe('1');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://careers.paychex.com/api/jobs'),
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'test-agent' }) }),
    );
    const callArgs = fetchMock.mock.calls[0][1] as RequestInit;
    expect(callArgs.method).toBeUndefined();
  });

  it('follows pagination and merges unique requisitions', async () => {
    const page1 = {
      jobs: [
        {
          data: {
            req_id: 'R100',
            title: 'Software Engineer',
            apply_url: 'https://careers-paychex.icims.com/jobs/R100/login',
            full_location: 'Rochester, NY, United States',
          },
        },
        {
          data: {
            req_id: 'R101',
            title: 'Data Engineer',
            apply_url: 'https://careers-paychex.icims.com/jobs/R101/login',
            full_location: 'Rochester, NY, United States',
          },
        },
      ],
      totalCount: 3,
      count: 2,
    };
    const page2 = {
      jobs: [
        {
          data: {
            req_id: 'R101',
            title: 'Data Engineer',
            apply_url: 'https://careers-paychex.icims.com/jobs/R101/login',
            full_location: 'Rochester, NY, United States',
          },
        },
        {
          data: {
            req_id: 'R102',
            title: 'Platform Engineer',
            apply_url: 'https://careers-paychex.icims.com/jobs/R102/login',
            full_location: 'Rochester, NY, United States',
          },
        },
      ],
      totalCount: 3,
      count: 2,
    };

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = url.searchParams.get('page');
      if (page === '1') {
        return { ok: true, json: async () => page1 };
      }
      if (page === '2') {
        return { ok: true, json: async () => page2 };
      }
      return { ok: true, json: async () => ({ jobs: [], totalCount: 3, count: 0 }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await paychexScraper.scrape();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(3);
    expect(jobs.map((job) => job.externalId).sort()).toEqual(['R100', 'R101', 'R102']);
  });

  it('throws when the API returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(paychexScraper.scrape()).rejects.toThrow('503');
  });
});

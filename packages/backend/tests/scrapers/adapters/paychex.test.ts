import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

const fixture = JSON.parse(readFileSync(join(fixturesDir, 'paychex-jobs.json'), 'utf8'));
const detailHtml = readFileSync(join(fixturesDir, 'paychex-detail.html'), 'utf8');

beforeEach(() => {
  vi.restoreAllMocks();
});

const { fetchRenderedDetailMock } = vi.hoisted(() => ({
  fetchRenderedDetailMock: vi.fn(),
}));

vi.mock('../../../src/config.js', () => ({
  config: {
    scraper: {
      userAgent: 'test-agent',
      timeoutMs: 5000,
      requestIntervalMs: 0,
      maxRetryAttempts: 1,
      retryBaseDelayMs: 0,
      detailIntervalMs: 0,
    },
  },
}));

vi.mock('../../../src/scrapers/adapters/paychexRenderedDetail.js', () => ({
  fetchPaychexRenderedJobDetail: fetchRenderedDetailMock,
}));

const { paychexScraper } = await import('../../../src/scrapers/adapters/paychex.js');

/**
 * Build a fetch mock that routes by URL:
 *   - careers.paychex.com/api/jobs  → listing API (returns fixture or empty)
 *   - careers-paychex.icims.com     → iCIMS detail page
 */
function buildFetchMock(options: {
  listingPayload?: unknown;
}) {
  const listing = options.listingPayload ?? fixture;
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('careers.paychex.com/api/jobs')) {
      return Promise.resolve({ ok: true, json: async () => listing });
    }
    throw new Error(`Unexpected fetch url in Paychex test: ${url}`);
  });
}

beforeEach(() => {
  fetchRenderedDetailMock.mockReset();
  fetchRenderedDetailMock.mockResolvedValue({ descriptionHtml: detailHtml });
});

describe('PaychexScraper', () => {
  it('has the correct employerKey', () => {
    expect(paychexScraper.employerKey).toBe('paychex');
  });

  it('maps Jibe jobs to ScrapedJob correctly', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));

    const jobs = await paychexScraper.scrape();

    expect(jobs).toHaveLength(2);

    const [first] = jobs;
    expect(first.externalId).toBe('R5001');
    expect(first.title).toBe('Software Engineer');
    expect(first.url).toBe('https://careers-paychex.icims.com/jobs/R5001/job');
    expect(first.location).toBe('Rochester, NY, United States');
    expect(first.department).toBe('Technology');
    expect(first.descriptionHtml).toContain('design and build scalable backend services');
    expect(first.remoteStatus).toBe('hybrid');
    expect(first.salaryRaw).toBe('95000');
    expect(first.datePostedAt).toBeInstanceOf(Date);
  });

  it('normalizes discovered iCIMS apply URLs to the public /job endpoint', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));

    const jobs = await paychexScraper.scrape();

    expect(jobs.map((job) => job.url)).toEqual([
      'https://careers-paychex.icims.com/jobs/R5001/job',
      'https://careers-paychex.icims.com/jobs/R5002/job',
    ]);
  });

  it('leaves already-normalized /job URLs unchanged', async () => {
    const listingPayload = {
      jobs: [
        {
          data: {
            req_id: 'R7001',
            title: 'Senior Engineer',
            apply_url: 'https://careers-paychex.icims.com/jobs/R7001/job',
            full_location: 'Rochester, NY, United States',
          },
        },
      ],
      totalCount: 1,
      count: 1,
    };
    vi.stubGlobal('fetch', buildFetchMock({ listingPayload }));

    const [first] = await paychexScraper.scrape();

    expect(first.url).toBe('https://careers-paychex.icims.com/jobs/R7001/job');
  });

  it('does not use listing descriptionHtml when rendered extraction returns nothing', async () => {
    fetchRenderedDetailMock.mockResolvedValue({});
    vi.stubGlobal('fetch', buildFetchMock({}));

    const [first] = await paychexScraper.scrape();

    expect(first.descriptionHtml).toBeUndefined();
  });

  it('maps On-Site tag to remoteStatus onsite', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));

    const jobs = await paychexScraper.scrape();
    expect(jobs[1].remoteStatus).toBe('onsite');
  });

  it('sets department to undefined when department is empty string', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));

    const jobs = await paychexScraper.scrape();
    expect(jobs[1].department).toBeUndefined();
  });

  it('sets salaryRaw to undefined when salary_value is 0', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));

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
    const fetchMock = buildFetchMock({ listingPayload: { jobs: [], totalCount: 0, count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    await paychexScraper.scrape();

    const listingCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes('careers.paychex.com/api/jobs'),
    );
    expect(listingCall).toBeDefined();
    const firstUrl = new URL(listingCall![0] as string);
    expect(firstUrl.origin + firstUrl.pathname).toBe('https://careers.paychex.com/api/jobs');
    expect(firstUrl.searchParams.get('city')).toBe('Rochester');
    expect(firstUrl.searchParams.get('state')).toBe('New York');
    expect(firstUrl.searchParams.get('page')).toBe('1');
    expect((listingCall![1] as RequestInit).method).toBeUndefined();
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
      if (url.hostname === 'careers.paychex.com') {
        const page = url.searchParams.get('page');
        if (page === '1') return { ok: true, json: async () => page1 };
        if (page === '2') return { ok: true, json: async () => page2 };
        return { ok: true, json: async () => ({ jobs: [], totalCount: 3, count: 0 }) };
      }
      throw new Error(`Unexpected fetch url in Paychex test: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await paychexScraper.scrape();

    // 2 listing calls + 3 detail calls = 5
    const listingCalls = fetchMock.mock.calls.filter(([url]) =>
      (url as string).includes('careers.paychex.com/api/jobs'),
    );
    expect(listingCalls).toHaveLength(2);
    expect(jobs).toHaveLength(3);
    expect(jobs.map((job) => job.externalId).sort()).toEqual(['R100', 'R101', 'R102']);
  });

  it('throws when the listing API returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(paychexScraper.scrape()).rejects.toThrow('503');
  });

  describe('detail enrichment', () => {
    it('populates descriptionHtml from the rendered job page helper', async () => {
      const fetchMock = buildFetchMock({});
      vi.stubGlobal('fetch', fetchMock);

      const [first] = await paychexScraper.scrape();

      expect(first.descriptionHtml).toContain('design and build scalable backend services');
      expect(fetchRenderedDetailMock).toHaveBeenCalled();
    });

    it('passes normalized /job URLs to the rendered detail helper', async () => {
      const fetchMock = buildFetchMock({});
      vi.stubGlobal('fetch', fetchMock);

      await paychexScraper.scrape();

      expect(fetchRenderedDetailMock).toHaveBeenCalled();
      for (const [url] of fetchRenderedDetailMock.mock.calls) {
        expect(url as string).toMatch(/\/job$/);
        expect(url as string).not.toMatch(/\/login$/);
      }
    });

    it('continues enriching remaining jobs when one detail fetch fails', async () => {
      fetchRenderedDetailMock
        .mockRejectedValueOnce(new Error('render failed'))
        .mockResolvedValueOnce({ descriptionHtml: detailHtml });
      vi.stubGlobal('fetch', buildFetchMock({}));

      const jobs = await paychexScraper.scrape();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].descriptionHtml).toBeUndefined();
      expect(jobs[1].descriptionHtml).toContain('design and build scalable backend services');
    });

    it('returns jobs without descriptionHtml when all detail fetches fail', async () => {
      fetchRenderedDetailMock.mockRejectedValue(new Error('render failed'));
      vi.stubGlobal('fetch', buildFetchMock({}));

      const jobs = await paychexScraper.scrape();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].title).toBe('Software Engineer');
      expect(jobs[0].descriptionHtml).toBeUndefined();
    });
  });
});

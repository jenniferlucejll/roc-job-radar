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

const { paychexScraper } = await import('../../../src/scrapers/adapters/paychex.js');

/**
 * Build a fetch mock that routes by URL:
 *   - careers.paychex.com/api/jobs  → listing API (returns fixture or empty)
 *   - careers-paychex.icims.com     → iCIMS detail page
 */
function buildFetchMock(options: {
  listingPayload?: unknown;
  detailHtml?: string;
  detailError?: boolean;
}) {
  const listing = options.listingPayload ?? fixture;
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('careers.paychex.com/api/jobs')) {
      return Promise.resolve({ ok: true, json: async () => listing });
    }
    // iCIMS detail page request
    if (options.detailError) {
      return Promise.resolve({ ok: false, status: 503 });
    }
    return Promise.resolve({
      ok: true,
      text: async () => options.detailHtml ?? detailHtml,
    });
  });
}

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
    expect(first.url).toBe('https://careers-paychex.icims.com/jobs/R5001/login');
    expect(first.location).toBe('Rochester, NY, United States');
    expect(first.department).toBe('Technology');
    expect(first.remoteStatus).toBe('hybrid');
    expect(first.salaryRaw).toBe('95000');
    expect(first.datePostedAt).toBeInstanceOf(Date);
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
      // iCIMS detail pages
      return { ok: true, text: async () => detailHtml };
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
    it('populates descriptionHtml from iCIMS job view page', async () => {
      vi.stubGlobal('fetch', buildFetchMock({}));

      const [first] = await paychexScraper.scrape();

      expect(first.descriptionHtml).toContain('design and build scalable backend services');
    });

    it('requests the iCIMS view URL (/job) not the apply URL (/login)', async () => {
      const fetchMock = buildFetchMock({});
      vi.stubGlobal('fetch', fetchMock);

      await paychexScraper.scrape();

      const detailCalls = fetchMock.mock.calls.filter(([url]) =>
        (url as string).includes('icims.com'),
      );
      expect(detailCalls.length).toBeGreaterThan(0);
      for (const [url] of detailCalls) {
        expect(url as string).toMatch(/\/job$/);
        expect(url as string).not.toMatch(/\/login$/);
      }
    });

    it('continues enriching remaining jobs when one detail fetch fails', async () => {
      let listingCallCount = 0;
      let detailCallCount = 0;
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes('careers.paychex.com/api/jobs')) {
          listingCallCount++;
          return Promise.resolve({
            ok: true,
            json: async () => (listingCallCount === 1 ? fixture : { jobs: [], totalCount: 2, count: 0 }),
          });
        }
        detailCallCount++;
        if (detailCallCount === 1) {
          return Promise.resolve({ ok: false, status: 503 });
        }
        return Promise.resolve({ ok: true, text: async () => detailHtml });
      });
      vi.stubGlobal('fetch', fetchMock);

      const jobs = await paychexScraper.scrape();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].descriptionHtml).toBeUndefined();
      expect(jobs[1].descriptionHtml).toContain('design and build scalable backend services');
    });

    it('returns jobs without descriptionHtml when all detail fetches fail', async () => {
      vi.stubGlobal('fetch', buildFetchMock({ detailError: true }));

      const jobs = await paychexScraper.scrape();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].title).toBe('Software Engineer');
      expect(jobs[0].descriptionHtml).toBeUndefined();
    });
  });
});

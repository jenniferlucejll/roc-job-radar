import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

const page1 = JSON.parse(readFileSync(join(fixturesDir, 'talentbrew-page1.json'), 'utf8'));
const page2 = JSON.parse(readFileSync(join(fixturesDir, 'talentbrew-page2.json'), 'utf8'));
const noJobs = { hasJobs: false, results: '<ul></ul>', filters: '' };
const detailHtml = readFileSync(join(fixturesDir, 'talentbrew-detail.html'), 'utf8');

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

const { l3harrisScraper } = await import('../../../src/scrapers/adapters/l3harris.js');

/**
 * Build a fetch mock that routes by URL:
 *   - /en/search-jobs/results → listing pages in order, then noJobs
 *   - /en/job/...             → detail HTML (or error if detailError: true)
 */
function buildFetchMock(options: {
  listingPages?: unknown[];
  detailHtml?: string;
  detailError?: boolean;
}) {
  const pages = [...(options.listingPages ?? [page1]), noJobs];
  let listingIdx = 0;
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/en/search-jobs/results')) {
      const payload = pages[listingIdx++] ?? noJobs;
      return Promise.resolve({ ok: true, json: async () => payload });
    }
    // Detail page request
    if (options.detailError) {
      return Promise.resolve({ ok: false, status: 503 });
    }
    return Promise.resolve({
      ok: true,
      text: async () => options.detailHtml ?? detailHtml,
    });
  });
}

describe('L3HarrisScraper', () => {
  it('has the correct employerKey', () => {
    expect(l3harrisScraper.employerKey).toBe('l3harris');
  });

  it('maps TalentBrew listing fields to ScrapedJob correctly', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ listingPages: [page1] }));

    const jobs = await l3harrisScraper.scrape();

    expect(jobs).toHaveLength(2);

    const [first] = jobs;
    expect(first.externalId).toBe('92001001');
    expect(first.title).toBe('Software Engineer');
    expect(first.url).toBe('https://careers.l3harris.com/en/job/rochester/software-engineer/4832/92001001');
    expect(first.location).toBe('Rochester, NY');
  });

  it('paginates until hasJobs is false', async () => {
    const fetchMock = buildFetchMock({ listingPages: [page1, page2] });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await l3harrisScraper.scrape();

    // 3 listing calls (page1, page2, noJobs) + 3 detail calls = 6
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(jobs).toHaveLength(3);
    expect(jobs[2].externalId).toBe('92001003');
  });

  it('stops pagination and detail enrichment once maxJobs is reached', async () => {
    const fetchMock = buildFetchMock({ listingPages: [page1, page2] });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await l3harrisScraper.scrape({ maxJobs: 3 });

    expect(jobs).toHaveLength(3);
    expect(jobs[2].externalId).toBe('92001003');
    // 2 listing calls (page1, page2) + 3 detail calls = 5
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('returns empty array when hasJobs is false on first page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => noJobs }),
    );

    const jobs = await l3harrisScraper.scrape();
    expect(jobs).toHaveLength(0);
  });

  it('uses GET with correct URL and headers for the listing request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => noJobs,
    });
    vi.stubGlobal('fetch', fetchMock);

    await l3harrisScraper.scrape();

    const listingCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes('/en/search-jobs/results'),
    );
    expect(listingCall).toBeDefined();
    expect(listingCall![1]).toMatchObject({
      headers: expect.objectContaining({
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'test-agent',
      }),
    });
    expect(listingCall![0]).toContain('Keywords=rochester-new-york');
    expect(listingCall![0]).toContain('OrganizationIds=4832');
    expect(listingCall![0]).toContain('CurrentPage=1');
  });

  it('throws when the listing API returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(l3harrisScraper.scrape()).rejects.toThrow('503');
  });

  describe('detail enrichment', () => {
    it('populates description, department, datePostedAt, and salary from detail page', async () => {
      vi.stubGlobal('fetch', buildFetchMock({ listingPages: [page1] }));

      const [first] = await l3harrisScraper.scrape();

      expect(first.descriptionHtml).toContain('Design and develop advanced defense systems software');
      expect(first.department).toBe('Engineering');
      expect(first.datePostedAt).toEqual(new Date('2024-03-15'));
      expect(first.salaryRaw).toBe('$100,000 - $150,000');
    });

    it('continues enriching remaining jobs when one detail fetch fails', async () => {
      let listingCallCount = 0;
      let detailCallCount = 0;
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes('/en/search-jobs/results')) {
          listingCallCount++;
          return Promise.resolve({ ok: true, json: async () => (listingCallCount === 1 ? page1 : noJobs) });
        }
        // First detail fails, second succeeds
        detailCallCount++;
        if (detailCallCount === 1) {
          return Promise.resolve({ ok: false, status: 503 });
        }
        return Promise.resolve({ ok: true, text: async () => detailHtml });
      });
      vi.stubGlobal('fetch', fetchMock);

      const jobs = await l3harrisScraper.scrape();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].descriptionHtml).toBeUndefined();
      expect(jobs[1].descriptionHtml).toContain('Design and develop advanced defense systems software');
    });

    it('returns jobs without enrichment fields when all detail fetches fail', async () => {
      vi.stubGlobal('fetch', buildFetchMock({ listingPages: [page1], detailError: true }));

      const jobs = await l3harrisScraper.scrape();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].title).toBe('Software Engineer');
      expect(jobs[0].descriptionHtml).toBeUndefined();
      expect(jobs[0].department).toBeUndefined();
    });
  });
});

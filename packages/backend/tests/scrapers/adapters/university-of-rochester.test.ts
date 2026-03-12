import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

const singlePage = JSON.parse(readFileSync(join(fixturesDir, 'workday-single-page.json'), 'utf8'));
const detailFixture = JSON.parse(readFileSync(join(fixturesDir, 'workday-detail.json'), 'utf8'));

beforeEach(() => {
  vi.restoreAllMocks();
});

// Minimal config mock so the adapter can import config.ts without a real DB env.
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

const { universityOfRochesterScraper } = await import(
  '../../../src/scrapers/adapters/university-of-rochester.js'
);

/** Build a mock fetch response that returns no Set-Cookie headers (skips enrichment). */
function listingResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
    headers: { getSetCookie: () => [] as string[] },
  };
}

/** Build a mock fetch response that returns a CSRF token (enables enrichment). */
function sessionResponse(csrfToken = 'test-csrf-token') {
  return {
    ok: true,
    json: async () => ({}),
    headers: {
      getSetCookie: () => [
        `CALYPSO_CSRF_TOKEN=${csrfToken}; Path=/; HttpOnly`,
        'PLAY_SESSION=abc123; Path=/; HttpOnly',
      ],
    },
  };
}

describe('UniversityOfRochesterScraper', () => {
  function posting(id: string, extras: Record<string, unknown> = {}) {
    return {
      title: `Role ${id}`,
      externalPath: `/job/Rochester-NY/Role-${id}_${id}`,
      locationsText: 'Rochester, NY, United States of America',
      ...extras,
    };
  }

  it('has the correct employerKey', () => {
    expect(universityOfRochesterScraper.employerKey).toBe('university-of-rochester');
  });

  it('maps Workday postings to ScrapedJob correctly (skips enrichment when no CSRF)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(listingResponse(singlePage)),
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
    expect(first.department).toBeUndefined();
    expect(first.descriptionHtml).toBeUndefined();
  });

  it('maps remoteType from listing to remoteStatus', async () => {
    const page = {
      total: 1,
      jobPostings: [
        {
          title: 'Remote Job',
          externalPath: '/job/Rochester-NY/Remote-Job_R99999',
          locationsText: 'Rochester, NY',
          remoteType: 'Hybrid',
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listingResponse(page)));

    const [job] = await universityOfRochesterScraper.scrape();
    expect(job.remoteStatus).toBe('hybrid');
  });

  it('maps postedOn from listing to datePostedAt when no enrichment', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const page = {
      total: 1,
      jobPostings: [
        {
          title: 'New Job',
          externalPath: '/job/Rochester-NY/New-Job_R88888',
          locationsText: 'Rochester, NY',
          postedOn: 'Posted Today',
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listingResponse(page)));

    const [job] = await universityOfRochesterScraper.scrape();
    expect(job.datePostedAt).toEqual(today);
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
    // 2 listing pages + 1 session GET (no CSRF → enrichment skipped)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listingResponse(page1Payload))
      .mockResolvedValueOnce(listingResponse(page2Payload))
      .mockResolvedValueOnce(listingResponse({ jobPostings: [], total: 0 })); // session
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await universityOfRochesterScraper.scrape();

    expect(fetchMock).toHaveBeenCalledTimes(3); // 2 listing + 1 session
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

    // 3 listing pages + 1 session GET (no CSRF → enrichment skipped)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listingResponse(page1Payload))
      .mockResolvedValueOnce(listingResponse(page2Payload))
      .mockResolvedValueOnce(listingResponse(page3Payload))
      .mockResolvedValueOnce(listingResponse({ jobPostings: [], total: 0 })); // session
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await universityOfRochesterScraper.scrape();

    expect(fetchMock).toHaveBeenCalledTimes(4); // 3 listing + 1 session
    expect(jobs).toHaveLength(41);
    expect(jobs.at(-1)?.externalId).toBe('R300');
  });

  it('returns empty array when total is 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(listingResponse({ jobPostings: [], total: 0 })),
    );

    const jobs = await universityOfRochesterScraper.scrape();
    expect(jobs).toHaveLength(0);
  });

  it('uses POST with correct URL and Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      listingResponse({ jobPostings: [], total: 0 }),
    );
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
      vi.fn().mockResolvedValue({ ok: false, status: 500, headers: { getSetCookie: () => [] } }),
    );

    await expect(universityOfRochesterScraper.scrape()).rejects.toThrow('500');
  });

  describe('detail enrichment', () => {
    /**
     * Build a fetch mock that routes by URL:
     *   - /en-US/UR_Staff  →  session response with CSRF token
     *   - POST /.../jobs   →  listing response
     *   - GET /.../job/... →  detail response
     */
    function buildEnrichmentMock(options: {
      listingPayload: unknown;
      detailPayload?: unknown;
      detailError?: boolean;
    }) {
      return vi.fn().mockImplementation((url: string, init: RequestInit) => {
        if (url.endsWith('/en-US/UR_Staff')) {
          return Promise.resolve(sessionResponse());
        }
        if (init?.method === 'POST') {
          return Promise.resolve(listingResponse(options.listingPayload));
        }
        // GET detail request
        if (options.detailError) {
          return Promise.resolve({ ok: false, status: 503, headers: { getSetCookie: () => [] } });
        }
        return Promise.resolve({
          ok: true,
          json: async () => options.detailPayload ?? detailFixture,
          headers: { getSetCookie: () => [] as string[] },
        });
      });
    }

    it('enriches jobs with description, salary, and department from detail API', async () => {
      const listingPayload = {
        total: 1,
        jobPostings: [
          {
            title: 'Lab Clin Support Tech III',
            externalPath: '/job/Rochester---NY/Lab-Clin-Support-Tech-III_R269431-1',
            locationsText: 'Rochester - NY',
            remoteType: 'On Site',
          },
        ],
      };

      vi.stubGlobal('fetch', buildEnrichmentMock({ listingPayload }));

      const [job] = await universityOfRochesterScraper.scrape();

      expect(job.descriptionHtml).toContain('Meliora');
      expect(job.salaryRaw).toBe('$20.31 - $27.42');
      expect(job.department).toBe('500236 Surgical Pathology SMH');
      expect(job.datePostedAt).toEqual(new Date('2026-03-11'));
      expect(job.remoteStatus).toBe('onsite');
    });

    it('falls back to listing postedOn when detail has no startDate', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const listingPayload = {
        total: 1,
        jobPostings: [
          {
            title: 'Some Job',
            externalPath: '/job/Rochester-NY/Some-Job_R00099',
            locationsText: 'Rochester, NY',
            postedOn: 'Posted Today',
          },
        ],
      };

      const detailWithoutStartDate = {
        jobPostingInfo: { jobDescription: '<p>Description only</p>' },
      };

      vi.stubGlobal(
        'fetch',
        buildEnrichmentMock({ listingPayload, detailPayload: detailWithoutStartDate }),
      );

      const [job] = await universityOfRochesterScraper.scrape();
      expect(job.datePostedAt).toEqual(today);
    });

    it('continues enriching remaining jobs when one detail fetch fails', async () => {
      const listingPayload = {
        total: 2,
        jobPostings: [
          {
            title: 'Job A',
            externalPath: '/job/Rochester-NY/Job-A_R00001',
            locationsText: 'Rochester, NY',
          },
          {
            title: 'Job B',
            externalPath: '/job/Rochester-NY/Job-B_R00002',
            locationsText: 'Rochester, NY',
          },
        ],
      };

      let detailCallCount = 0;
      const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit) => {
        if (url.endsWith('/en-US/UR_Staff')) return Promise.resolve(sessionResponse());
        if (init?.method === 'POST') return Promise.resolve(listingResponse(listingPayload));
        // First detail fails, second succeeds
        detailCallCount++;
        if (detailCallCount === 1) {
          return Promise.resolve({ ok: false, status: 503, headers: { getSetCookie: () => [] } });
        }
        return Promise.resolve({
          ok: true,
          json: async () => detailFixture,
          headers: { getSetCookie: () => [] as string[] },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const jobs = await universityOfRochesterScraper.scrape();

      expect(jobs).toHaveLength(2);
      // First job: detail failed → no description
      expect(jobs[0].descriptionHtml).toBeUndefined();
      // Second job: detail succeeded → has description
      expect(jobs[1].descriptionHtml).toContain('Meliora');
    });
  });
});

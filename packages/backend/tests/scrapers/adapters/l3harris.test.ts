import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

const page1 = JSON.parse(readFileSync(join(fixturesDir, 'talentbrew-page1.json'), 'utf8'));
const page2 = JSON.parse(readFileSync(join(fixturesDir, 'talentbrew-page2.json'), 'utf8'));
const noJobs = { hasJobs: false, results: '<ul></ul>', filters: '' };

beforeEach(() => {
  vi.restoreAllMocks();
});

vi.mock('../../../src/config.js', () => ({
  config: {
    scraper: { userAgent: 'test-agent', timeoutMs: 5000 },
  },
}));

const { l3harrisScraper } = await import('../../../src/scrapers/adapters/l3harris.js');

describe('L3HarrisScraper', () => {
  it('has the correct employerKey', () => {
    expect(l3harrisScraper.employerKey).toBe('l3harris');
  });

  it('maps TalentBrew jobs to ScrapedJob correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => page1 })
        .mockResolvedValueOnce({ ok: true, json: async () => noJobs }),
    );

    const jobs = await l3harrisScraper.scrape();

    expect(jobs).toHaveLength(2);

    const [first] = jobs;
    expect(first.externalId).toBe('92001001');
    expect(first.title).toBe('Software Engineer');
    expect(first.url).toBe('https://careers.l3harris.com/en/job/rochester/software-engineer/4832/92001001');
    expect(first.location).toBe('Rochester, NY');
  });

  it('paginates until hasJobs is false', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 })
      .mockResolvedValueOnce({ ok: true, json: async () => noJobs });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await l3harrisScraper.scrape();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(jobs).toHaveLength(3);
    expect(jobs[2].externalId).toBe('92001003');
  });

  it('returns empty array when hasJobs is false on first page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => noJobs }),
    );

    const jobs = await l3harrisScraper.scrape();
    expect(jobs).toHaveLength(0);
  });

  it('uses GET with correct URL and headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => noJobs,
    });
    vi.stubGlobal('fetch', fetchMock);

    await l3harrisScraper.scrape();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('careers.l3harris.com/en/search-jobs/results'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'test-agent',
        }),
      }),
    );
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('Keywords=rochester-new-york');
    expect(calledUrl).toContain('OrganizationIds=4832');
    expect(calledUrl).toContain('CurrentPage=1');
  });

  it('throws when the API returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(l3harrisScraper.scrape()).rejects.toThrow('503');
  });
});

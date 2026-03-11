import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, '..', 'fixtures', 'esl-careers.html'), 'utf8');

beforeEach(() => {
  vi.restoreAllMocks();
});

vi.mock('../../../src/config.js', () => ({
  config: {
    scraper: { userAgent: 'test-agent', timeoutMs: 5000 },
  },
}));

const { eslScraper } = await import('../../../src/scrapers/adapters/esl.js');

describe('ESLScraper', () => {
  it('has the correct employerKey', () => {
    expect(eslScraper.employerKey).toBe('esl');
  });

  it('extracts jobs from JSON-LD and anchor fallback markup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => fixture }));

    const jobs = await eslScraper.scrape();
    expect(jobs).toHaveLength(2);

    const jsonLdJob = jobs.find((job) => job.externalId.includes('r123'));
    expect(jsonLdJob?.title).toBe('Senior Software Engineer');
    expect(jsonLdJob?.url).toContain('/senior-software-engineer-r123');
    expect(jsonLdJob?.location).toBe('Rochester, NY, USA');

    const fallbackJob = jobs.find((job) => job.externalId === 'ESL-2001');
    expect(fallbackJob?.title).toBe('Data Engineer');
    expect(fallbackJob?.url).toBe('https://www.esl.org/careers/job/ESL-2001');
    expect(fallbackJob?.location).toBe('Rochester, NY');
  });

  it('uses the ESL careers URL and user-agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => fixture,
    });
    vi.stubGlobal('fetch', fetchMock);

    await eslScraper.scrape();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.esl.org/about-esl/careers',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'test-agent',
        }),
      }),
    );
  });

  it('throws when careers page request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    await expect(eslScraper.scrape()).rejects.toThrow('ESL careers page returned 500');
  });
});

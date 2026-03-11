// ATS: Jibe (Google Cloud Talent Solution) / iCIMS
// Career page: https://www.paychex.com/careers
// API: GET https://careers.paychex.com/api/jobs
// externalId: req_id field (iCIMS requisition ID, e.g. "40371")
// Scraping: Jibe JSON API — returns all jobs in a single response (no pagination)
// Note: each element in jobs[] wraps the actual fields under a "data" key
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper } from '../base.js';
import { fetchWithRetry } from '../requestRetry.js';

const JOBS_URL = 'https://careers.paychex.com/api/jobs';

interface JibeJobData {
  req_id: string;
  title: string;
  description?: string;
  apply_url: string;
  full_location?: string;
  department?: string;
  tags3?: string[];
  salary_value?: number | null;
  posted_date?: string;
}

interface JibeJob {
  data: JibeJobData;
}

interface JibeResponse {
  jobs: JibeJob[];
}

function toRemoteStatus(tags: string[] | undefined): ScrapedJob['remoteStatus'] {
  const tag = tags?.[0]?.toLowerCase();
  if (!tag) return undefined;
  if (tag.includes('remote')) return 'remote';
  if (tag.includes('hybrid')) return 'hybrid';
  if (tag.includes('on-site') || tag.includes('onsite') || tag.includes('in office')) return 'onsite';
  return undefined;
}

export class PaychexScraper extends BaseScraper {
  readonly employerKey = 'paychex';

  async scrape(): Promise<ScrapedJob[]> {
    const data = await fetchWithRetry(
      JOBS_URL,
      async (res) => (await res.json()) as JibeResponse,
      {
        headers: { 'User-Agent': config.scraper.userAgent },
        timeoutMs: config.scraper.timeoutMs,
        maxAttempts: config.scraper.maxRetryAttempts,
        baseDelayMs: config.scraper.retryBaseDelayMs,
      },
    );

    return data.jobs.map(({ data: j }): ScrapedJob => ({
      externalId: j.req_id,
      title: j.title,
      url: j.apply_url,
      location: j.full_location || undefined,
      department: j.department || undefined,
      descriptionHtml: j.description || undefined,
      remoteStatus: toRemoteStatus(j.tags3),
      salaryRaw: j.salary_value ? String(j.salary_value) : undefined,
      datePostedAt: j.posted_date ? new Date(j.posted_date) : undefined,
    }));
  }
}

export const paychexScraper = new PaychexScraper();

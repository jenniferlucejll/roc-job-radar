// ATS: Jibe (Google Cloud Talent Solution) / iCIMS
// Career page: https://www.paychex.com/careers
// API: GET https://careers.paychex.com/api/jobs
// externalId: req_id field (iCIMS requisition ID, e.g. "40371")
// Scraping: Jibe JSON API, paginated via `page`; scoped to Rochester, NY via query params
// Note: each element in jobs[] wraps the actual fields under a "data" key
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper, ScrapeContext } from '../base.js';
import { fetchWithRetry } from '../requestRetry.js';

const JOBS_URL = 'https://careers.paychex.com/api/jobs';
const TARGET_CITY = 'Rochester';
const TARGET_STATE = 'New York';
const MAX_STAGNANT_PAGES = 2;

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
  totalCount?: number;
  count?: number;
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

  async scrape(context?: ScrapeContext): Promise<ScrapedJob[]> {
    const byId = new Map<string, ScrapedJob>();
    let totalCount: number | undefined;
    let page = 1;
    let stagnantPages = 0;

    while (true) {
      const data = await fetchPaychexPage(page, context);
      const pageJobs = data.jobs ?? [];
      const beforeCount = byId.size;

      for (const { data: j } of pageJobs) {
        byId.set(j.req_id, {
          externalId: j.req_id,
          title: j.title,
          url: j.apply_url,
          location: j.full_location || undefined,
          department: j.department || undefined,
          descriptionHtml: j.description || undefined,
          remoteStatus: toRemoteStatus(j.tags3),
          salaryRaw: j.salary_value ? String(j.salary_value) : undefined,
          datePostedAt: j.posted_date ? new Date(j.posted_date) : undefined,
        });
      }

      if (typeof data.totalCount === 'number') {
        totalCount = data.totalCount;
      }
      if (pageJobs.length === 0) {
        break;
      }
      if (byId.size === beforeCount) {
        stagnantPages++;
      } else {
        stagnantPages = 0;
      }
      if (stagnantPages >= MAX_STAGNANT_PAGES) {
        break;
      }
      if (totalCount !== undefined && byId.size >= totalCount) {
        break;
      }
      page++;
    }

    return [...byId.values()];
  }
}

async function fetchPaychexPage(page: number, context?: ScrapeContext): Promise<JibeResponse> {
  const url = new URL(JOBS_URL);
  url.searchParams.set('city', TARGET_CITY);
  url.searchParams.set('state', TARGET_STATE);
  url.searchParams.set('page', String(page));

  return fetchWithRetry(
    url.toString(),
    async (res) => (await res.json()) as JibeResponse,
    {
      headers: { 'User-Agent': config.scraper.userAgent },
      timeoutMs: config.scraper.timeoutMs,
      maxAttempts: config.scraper.maxRetryAttempts,
      baseDelayMs: config.scraper.retryBaseDelayMs,
      onAttempt: context?.onRequestAttempt,
    },
  );
}

export const paychexScraper = new PaychexScraper();

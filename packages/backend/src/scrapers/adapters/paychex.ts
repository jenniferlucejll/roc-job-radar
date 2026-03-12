// ATS: Jibe (Google Cloud Talent Solution) / iCIMS
// Career page: https://www.paychex.com/careers
// API: GET https://careers.paychex.com/api/jobs
// externalId: req_id field (iCIMS requisition ID, e.g. "40371")
// Scraping: Jibe JSON API, paginated via `page`; scoped to Rochester, NY via query params
// Note: each element in jobs[] wraps the actual fields under a "data" key
// Detail enrichment: iCIMS job view page (apply_url with /login → /job) parsed with Cheerio
import { load } from 'cheerio';
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper, ScrapeContext } from '../base.js';
import { fetchWithRetry } from '../requestRetry.js';
import { createRequestThrottler } from '../requestThrottle.js';

const JOBS_URL = 'https://careers.paychex.com/api/jobs';
const TARGET_CITY = 'Rochester';
const TARGET_STATE = 'New York';
const MAX_STAGNANT_PAGES = 2;

interface JibeJobData {
  req_id: string;
  title: string;
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

    console.log(`[paychex] Fetching listing: GET ${JOBS_URL} (Rochester, NY)`);

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
          remoteStatus: toRemoteStatus(j.tags3),
          salaryRaw: j.salary_value ? String(j.salary_value) : undefined,
          datePostedAt: j.posted_date ? new Date(j.posted_date) : undefined,
        });
      }

      if (typeof data.totalCount === 'number') {
        totalCount = data.totalCount;
      }
      const totalStr = totalCount !== undefined ? ` / ${totalCount} total` : '';
      console.log(`[paychex] Page ${page}: ${pageJobs.length} jobs (running total: ${byId.size}${totalStr})`);
      if (pageJobs.length === 0) {
        break;
      }
      if (byId.size === beforeCount) {
        stagnantPages++;
      } else {
        stagnantPages = 0;
      }
      if (stagnantPages >= MAX_STAGNANT_PAGES) {
        console.log(`[paychex] Stagnant page detected (${MAX_STAGNANT_PAGES} consecutive) — stopping pagination`);
        break;
      }
      if (totalCount !== undefined && byId.size >= totalCount) {
        break;
      }
      page++;
    }

    const jobs = [...byId.values()];
    console.log(`[paychex] Listing complete: ${jobs.length} job${jobs.length !== 1 ? 's' : ''}`);

    // -------------------------------------------------------------------------
    // Detail enrichment: the Jibe listing API's description field is company
    // boilerplate (identical for every job). Fetch each iCIMS job view page
    // (/login → /job) to get the real job-specific description.
    // -------------------------------------------------------------------------
    console.log(`[paychex] Enriching details for ${jobs.length} jobs`);
    const detailThrottler = createRequestThrottler(config.scraper.detailIntervalMs);
    for (const [i, job] of jobs.entries()) {
      await detailThrottler.waitForNextSlot();
      console.log(`[paychex] Detail ${i + 1}/${jobs.length} — ${job.url}`);
      try {
        const detail = await fetchPaychexJobDetail(job.url, config.scraper.userAgent, config.scraper.timeoutMs);
        if (detail.descriptionHtml) job.descriptionHtml = detail.descriptionHtml;
      } catch (err) {
        console.warn(`[paychex] Detail fetch failed for ${job.url} — skipping:`, err);
      }
    }

    console.log(`[paychex] Detail enrichment complete`);
    return jobs;
  }
}

async function fetchPaychexJobDetail(
  applyUrl: string,
  userAgent: string,
  timeoutMs: number,
): Promise<Partial<ScrapedJob>> {
  const viewUrl = applyUrl.replace(/\/login$/, '/job');
  const resp = await fetch(viewUrl, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    throw new Error(`Paychex detail request failed: HTTP ${resp.status}`);
  }

  const html = await resp.text();
  const $ = load(html);

  const result: Partial<ScrapedJob> = {};

  // iCIMS job detail pages embed the description in .iCIMS_InfoMsg_Job or #iCIMS_Content_9
  const descEl = $('.iCIMS_InfoMsg_Job, #iCIMS_Content_9').first();
  const descHtml = descEl.html()?.trim();
  if (descHtml) result.descriptionHtml = descHtml;

  return result;
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

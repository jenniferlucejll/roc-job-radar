import type { ScrapedJob } from '../types/index.js';
import { createRequestThrottler } from './requestThrottle.js';
import { fetchWithRetry } from './requestRetry.js';
import type { ScrapeContext } from './base.js';

export interface WorkdayConfig {
  /** Full POST endpoint, e.g. https://rochester.wd5.myworkdayjobs.com/wday/cxs/rochester/UR_Staff/jobs */
  apiUrl: string;
  /** Scheme + host used to build job URLs, e.g. https://rochester.wd5.myworkdayjobs.com */
  baseUrl: string;
}

const LIMIT = 20;

interface WorkdayPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
  bulletFields?: string[];
}

interface WorkdayResponse {
  jobPostings: WorkdayPosting[];
  total: number;
}

/**
 * Fetch all job postings from a Workday careers JSON API.
 * Paginates automatically until all postings are retrieved.
 */
export async function fetchWorkdayJobs(
  wdConfig: WorkdayConfig,
  userAgent: string,
  timeoutMs: number,
  requestIntervalMs = 1000,
  maxRetryAttempts = 3,
  retryBaseDelayMs = 1000,
  context?: ScrapeContext,
): Promise<ScrapedJob[]> {
  const throttler = createRequestThrottler(requestIntervalMs);
  const all: ScrapedJob[] = [];
  let offset = 0;
  let total: number | null = null;

  while (true) {
    await throttler.waitForNextSlot();

    const data = await fetchWithRetry(
      wdConfig.apiUrl,
      async (res) => (await res.json()) as WorkdayResponse,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
        body: JSON.stringify({
          appliedFacets: {},
          limit: LIMIT,
          offset,
          searchText: '',
        }),
        timeoutMs,
        maxAttempts: maxRetryAttempts,
        baseDelayMs: retryBaseDelayMs,
        onAttempt: context?.onRequestAttempt,
      },
    );

    const pageCount = data.jobPostings.length;
    if (Number.isFinite(data.total) && data.total > 0) {
      total = total === null ? data.total : Math.max(total, data.total);
    }

    for (const p of data.jobPostings) {
      // Extract the requisition ID from the end of externalPath (e.g. "_R261316")
      // Fall back to the full path if the pattern doesn't match.
      const idMatch = p.externalPath.match(/_([A-Z0-9]+)$/);
      const externalId = idMatch ? idMatch[1] : p.externalPath;

      const job: ScrapedJob = {
        externalId,
        title: p.title,
        url: `${wdConfig.baseUrl}/en-US${p.externalPath}`,
        location: p.locationsText?.trim() || undefined,
        // department not available from the Workday listing API
      };
      all.push(job);
    }

    if (pageCount === 0) {
      break;
    }

    // Advance by actual count returned (handles last page returning fewer than LIMIT)
    offset += pageCount;

    if (total !== null && offset >= total) {
      break;
    }

    if (pageCount < LIMIT) {
      break;
    }
  }

  return all;
}

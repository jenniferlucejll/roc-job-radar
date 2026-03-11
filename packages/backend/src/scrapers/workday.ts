import type { ScrapedJob } from '../types/index.js';

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
): Promise<ScrapedJob[]> {
  const all: ScrapedJob[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let data: WorkdayResponse;
    try {
      const res = await fetch(wdConfig.apiUrl, {
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
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Workday API returned ${res.status}`);
      data = (await res.json()) as WorkdayResponse;
    } finally {
      clearTimeout(timer);
    }

    total = data.total;

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

    // Advance by actual count returned (handles last page returning fewer than LIMIT)
    offset += data.jobPostings.length;
  }

  return all;
}

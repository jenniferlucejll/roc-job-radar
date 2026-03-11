import type { ScrapedJob } from '../types/index.js';

export interface WorkdayConfig {
  /** Full POST endpoint, e.g. https://rochester.wd5.myworkdayjobs.com/wday/cxs/rochester/UR_Staff/jobs */
  apiUrl: string;
  /** Scheme + host used to build job URLs, e.g. https://rochester.wd5.myworkdayjobs.com */
  baseUrl: string;
}

const LIMIT = 20;

interface WorkdayPosting {
  jobPostingId: string;
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
      const job: ScrapedJob = {
        externalId: p.jobPostingId,
        title: p.title,
        url: `${wdConfig.baseUrl}/en-US${p.externalPath}`,
        location: p.locationsText?.trim() || undefined,
        department: p.bulletFields?.[0] || undefined,
      };
      all.push(job);
    }

    // Advance by actual count returned (handles last page returning fewer than LIMIT)
    offset += data.jobPostings.length;
  }

  return all;
}

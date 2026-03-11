// ATS: Jibe (Google Cloud Talent Solution)
// Career page: https://www.paychex.com/careers
// API: GET https://careers.paychex.com/api/jobs
// externalId: req_id field (ATS requisition ID, e.g. "R5001")
// Scraping: Jibe JSON API — returns all jobs in a single response (no pagination)
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper } from '../base.js';

const JOBS_URL = 'https://careers.paychex.com/api/jobs';

interface JibeJob {
  req_id: string;
  title: string;
  description?: string;
  apply_url: string;
  full_location?: string;
  department?: string;
  tags3?: string;
  salary_value?: string | null;
  posted_date?: string;
}

interface JibeResponse {
  jobs: JibeJob[];
}

function toRemoteStatus(tag: string | undefined): ScrapedJob['remoteStatus'] {
  if (!tag) return undefined;
  const t = tag.toLowerCase();
  if (t.includes('remote')) return 'remote';
  if (t.includes('hybrid')) return 'hybrid';
  if (t.includes('on-site') || t.includes('onsite') || t.includes('in office')) return 'onsite';
  return undefined;
}

export class PaychexScraper extends BaseScraper {
  readonly employerKey = 'paychex';

  async scrape(): Promise<ScrapedJob[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.scraper.timeoutMs);

    let data: JibeResponse;
    try {
      const res = await fetch(JOBS_URL, {
        headers: { 'User-Agent': config.scraper.userAgent },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Paychex API returned ${res.status}`);
      data = (await res.json()) as JibeResponse;
    } finally {
      clearTimeout(timer);
    }

    return data.jobs.map((j): ScrapedJob => ({
      externalId: j.req_id,
      title: j.title,
      url: j.apply_url,
      location: j.full_location || undefined,
      department: j.department || undefined,
      descriptionHtml: j.description || undefined,
      remoteStatus: toRemoteStatus(j.tags3),
      salaryRaw: j.salary_value || undefined,
      datePostedAt: j.posted_date ? new Date(j.posted_date) : undefined,
    }));
  }
}

export const paychexScraper = new PaychexScraper();

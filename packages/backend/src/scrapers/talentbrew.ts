import { load } from 'cheerio';
import { createRequestThrottler } from './requestThrottle.js';
import type { ScrapeContext } from './base.js';
import type { ScrapedJob } from '../types/index.js';
import { fetchWithRetry } from './requestRetry.js';

export interface TalentBrewConfig {
  /** Scheme + host, e.g. https://careers.l3harris.com */
  baseUrl: string;
  /** Location slug used as the Keywords query param, e.g. rochester-new-york */
  locationSlug: string;
  /** TalentBrew company/org ID, e.g. 4832 */
  orgId: string;
}

interface TalentBrewResponse {
  hasJobs: boolean;
  results: string; // HTML fragment containing <ul><li>... job cards
}

/**
 * Fetch a single TalentBrew job detail page and extract enrichment fields.
 * TalentBrew detail pages embed the description in #ats-description and
 * metadata (Category, Date, Salary) in <dl> blocks with <dt>/<dd> pairs.
 */
async function fetchTalentBrewJobDetail(
  jobUrl: string,
  userAgent: string,
  timeoutMs: number,
): Promise<Partial<ScrapedJob>> {
  const resp = await fetch(jobUrl, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    throw new Error(`TalentBrew detail request failed: HTTP ${resp.status}`);
  }

  const html = await resp.text();
  const $ = load(html);

  const result: Partial<ScrapedJob> = {};

  // Description — try known TalentBrew selectors; comma selector picks first match
  const descEl = $('#ats-description, .ats-description, #job-details .content').first();
  const descHtml = descEl.html()?.trim();
  if (descHtml) result.descriptionHtml = descHtml;

  // Metadata: scan all <dt> elements and match by label text
  $('dt').each((_, dt) => {
    const label = $(dt).text().trim().toLowerCase();
    const value = $(dt).next('dd').text().trim();
    if (!value) return;

    if (label.includes('category') || label.includes('job category')) {
      result.department = value;
    } else if (label.includes('date') || label.includes('posted')) {
      const parsed = parseTalentBrewDate(value);
      if (parsed) result.datePostedAt = parsed;
    } else if (label.includes('salary') || label.includes('compensation')) {
      result.salaryRaw = value;
    }
  });

  return result;
}

/**
 * Parse a TalentBrew date string into a Date.
 * Handles ISO format (YYYY-MM-DD) and common US formats (MM/DD/YYYY).
 */
function parseTalentBrewDate(value: string): Date | undefined {
  const trimmed = value.trim();
  // ISO: 2024-03-15
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? undefined : d;
  }
  // US: 03/15/2024
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export async function fetchTalentBrewJobs(
  tbConfig: TalentBrewConfig,
  userAgent: string,
  timeoutMs: number,
  requestIntervalMs = 1000,
  maxRetryAttempts = 3,
  retryBaseDelayMs = 1000,
  context?: ScrapeContext,
  enrichDetails = false,
  detailIntervalMs = 3000,
): Promise<ScrapedJob[]> {
  const throttler = createRequestThrottler(requestIntervalMs);
  const all: ScrapedJob[] = [];
  const maxJobs = context?.maxJobs;
  let page = 1;
  let pagesFetched = 0;

  console.log(`[talentbrew] Fetching listing: GET ${tbConfig.baseUrl} (${tbConfig.locationSlug})`);

  while (true) {
    await throttler.waitForNextSlot();

    const url = new URL(`${tbConfig.baseUrl}/en/search-jobs/results`);
    url.searchParams.set('CurrentPage', String(page));
    url.searchParams.set('Keywords', tbConfig.locationSlug);
    url.searchParams.set('OrganizationIds', tbConfig.orgId);
    url.searchParams.set('SortCriteria', '0');
    url.searchParams.set('SortDirection', '0');
    url.searchParams.set('SearchResultsModuleName', 'Search Results');
    url.searchParams.set('SearchFiltersModuleName', 'Search Filters');
    url.searchParams.set('RecordsPerPage', '15');

    const data = await fetchWithRetry(
      url.toString(),
      async (res) => (await res.json()) as TalentBrewResponse,
      {
        headers: {
          'User-Agent': userAgent,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeoutMs,
        maxAttempts: maxRetryAttempts,
        baseDelayMs: retryBaseDelayMs,
        onAttempt: context?.onRequestAttempt,
      },
    );
    if (!data.hasJobs) break;
    pagesFetched++;

    const countBefore = all.length;
    const $ = load(data.results);
    $('a[data-job-id]').each((_, el) => {
      if (maxJobs !== undefined && all.length >= maxJobs) {
        return false;
      }

      const a = $(el);
      const externalId = a.attr('data-job-id')!;
      const href = a.attr('href')!;
      const jobUrl = href.startsWith('http') ? href : `${tbConfig.baseUrl}${href}`;
      const title = a.find('h2').text().trim();
      const location = a.find('.job-location').text().trim();

      all.push({
        externalId,
        title,
        url: jobUrl,
        location: location || undefined,
      });
    });

    console.log(`[talentbrew] Page ${page}: ${all.length - countBefore} jobs (running total: ${all.length})`);

    if (maxJobs !== undefined && all.length >= maxJobs) {
      break;
    }

    page++;
  }

  console.log(
    `[talentbrew] Listing complete: ${all.length} job${all.length !== 1 ? 's' : ''} ` +
    `across ${pagesFetched} page${pagesFetched !== 1 ? 's' : ''}`,
  );

  if (!enrichDetails || all.length === 0) {
    return all;
  }

  // ---------------------------------------------------------------------------
  // Detail enrichment: fetch each job's HTML page for description, department,
  // date posted, and salary. Requests are throttled to be polite to the server.
  // ---------------------------------------------------------------------------
  console.log(`[talentbrew] Enriching details for ${all.length} jobs`);
  const detailThrottler = createRequestThrottler(detailIntervalMs);

  for (const [i, job] of all.entries()) {
    await detailThrottler.waitForNextSlot();
    console.log(`[talentbrew] Detail ${i + 1}/${all.length} — ${job.url}`);
    try {
      const detail = await fetchTalentBrewJobDetail(job.url, userAgent, timeoutMs);
      if (detail.descriptionHtml) job.descriptionHtml = detail.descriptionHtml;
      if (detail.department) job.department = detail.department;
      if (detail.datePostedAt) job.datePostedAt = detail.datePostedAt;
      if (detail.salaryRaw) job.salaryRaw = detail.salaryRaw;
    } catch (err) {
      console.warn(`[talentbrew] Detail fetch failed for ${job.url} — skipping:`, err);
    }
  }

  console.log(`[talentbrew] Detail enrichment complete`);
  return all;
}

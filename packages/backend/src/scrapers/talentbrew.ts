import { load } from 'cheerio';
import { createRequestThrottler } from './requestThrottle.js';
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

export async function fetchTalentBrewJobs(
  tbConfig: TalentBrewConfig,
  userAgent: string,
  timeoutMs: number,
  requestIntervalMs = 1000,
  maxRetryAttempts = 3,
  retryBaseDelayMs = 1000,
): Promise<ScrapedJob[]> {
  const throttler = createRequestThrottler(requestIntervalMs);
  const all: ScrapedJob[] = [];
  let page = 1;

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
      },
    );
    if (!data.hasJobs) break;

    const $ = load(data.results);
    $('a[data-job-id]').each((_, el) => {
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

    page++;
  }

  return all;
}

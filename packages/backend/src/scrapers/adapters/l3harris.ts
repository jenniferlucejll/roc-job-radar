// ATS: TalentBrew (TMP Worldwide), company ID 4832
// Career page: https://careers.l3harris.com
// API: GET https://careers.l3harris.com/en/search-jobs/results (AJAX, JSON envelope wrapping HTML fragment)
// Location filter: Keywords=rochester-new-york, OrganizationIds=4832
// externalId: numeric TalentBrew posting ID from data-job-id attribute (e.g. "91162231968")
// Pagination: loop pages until hasJobs: false
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper } from '../base.js';
import { fetchTalentBrewJobs } from '../talentbrew.js';

const TB_CONFIG = {
  baseUrl: 'https://careers.l3harris.com',
  locationSlug: 'rochester-new-york',
  orgId: '4832',
};

export class L3HarrisScraper extends BaseScraper {
  readonly employerKey = 'l3harris';

  async scrape(): Promise<ScrapedJob[]> {
    return fetchTalentBrewJobs(
      TB_CONFIG,
      config.scraper.userAgent,
      config.scraper.timeoutMs,
      config.scraper.requestIntervalMs,
      config.scraper.maxRetryAttempts,
      config.scraper.retryBaseDelayMs,
    );
  }
}

export const l3harrisScraper = new L3HarrisScraper();

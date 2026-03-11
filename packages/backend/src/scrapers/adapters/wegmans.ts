// ATS: TalentBrew (TMP Worldwide), company ID 1839
// Career page: https://jobs.wegmans.com
// API: GET https://jobs.wegmans.com/en/search-jobs/results (AJAX, JSON envelope wrapping HTML fragment)
// Location filter: Keywords=rochester-ny, OrganizationIds=1839
// externalId: numeric TalentBrew posting ID from data-job-id attribute (e.g. "92647691424")
// Pagination: loop pages until hasJobs: false
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper } from '../base.js';
import { fetchTalentBrewJobs } from '../talentbrew.js';

const TB_CONFIG = {
  baseUrl: 'https://jobs.wegmans.com',
  locationSlug: 'rochester-ny',
  orgId: '1839',
};

export class WegmansScraper extends BaseScraper {
  readonly employerKey = 'wegmans';

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

export const wegmansScraper = new WegmansScraper();

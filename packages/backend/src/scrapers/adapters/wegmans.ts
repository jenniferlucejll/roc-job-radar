// ATS: TalentBrew (TMP Worldwide), company ID 1839
// Career page: https://jobs.wegmans.com
// API: GET https://jobs.wegmans.com/en/search-jobs/results (AJAX, JSON envelope wrapping HTML fragment)
// Location filter: Keywords=rochester-ny, OrganizationIds=1839
// externalId: numeric TalentBrew posting ID from data-job-id attribute (e.g. "92647691424")
// Pagination: loop pages until hasJobs: false
// Detail enrichment: fetches each job's HTML page for description, department, date posted
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper, ScrapeContext } from '../base.js';
import { fetchTalentBrewJobs } from '../talentbrew.js';

const TB_CONFIG = {
  baseUrl: 'https://jobs.wegmans.com',
  locationSlug: 'rochester-ny',
  orgId: '1839',
};

export class WegmansScraper extends BaseScraper {
  readonly employerKey = 'wegmans';

  async scrape(context?: ScrapeContext): Promise<ScrapedJob[]> {
    return fetchTalentBrewJobs(
      TB_CONFIG,
      config.scraper.userAgent,
      config.scraper.timeoutMs,
      config.scraper.requestIntervalMs,
      config.scraper.maxRetryAttempts,
      config.scraper.retryBaseDelayMs,
      context,
      true, // enrichDetails: fetch individual job pages for description, department, date posted
      config.scraper.detailIntervalMs,
    );
  }
}

export const wegmansScraper = new WegmansScraper();

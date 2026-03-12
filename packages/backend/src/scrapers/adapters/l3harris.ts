// ATS: TalentBrew (TMP Worldwide), company ID 4832
// Career page: https://careers.l3harris.com
// API: GET https://careers.l3harris.com/en/search-jobs/results (AJAX, JSON envelope wrapping HTML fragment)
// Location filter: Keywords=rochester-new-york, OrganizationIds=4832
// externalId: numeric TalentBrew posting ID from data-job-id attribute (e.g. "91162231968")
// Pagination: loop pages until hasJobs: false
// Detail enrichment: fetches each job's HTML page for description, department, date posted
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper, ScrapeContext } from '../base.js';
import { fetchTalentBrewJobs } from '../talentbrew.js';

const TB_CONFIG = {
  baseUrl: 'https://careers.l3harris.com',
  locationSlug: 'rochester-new-york',
  orgId: '4832',
};

export class L3HarrisScraper extends BaseScraper {
  readonly employerKey = 'l3harris';

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

export const l3harrisScraper = new L3HarrisScraper();

// ATS: Workday
// Career page: https://www.rochester.edu/careers/
// Workday tenant: rochester.wd5.myworkdayjobs.com
// API: POST https://rochester.wd5.myworkdayjobs.com/wday/cxs/rochester/UR_Staff/jobs
// externalId: Workday jobPostingId (e.g. "R257069")
// Scraping: Workday JSON API (POST with pagination)
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper, ScrapeContext } from '../base.js';
import { fetchWorkdayJobs } from '../workday.js';

const WD_CONFIG = {
  apiUrl: 'https://rochester.wd5.myworkdayjobs.com/wday/cxs/rochester/UR_Staff/jobs',
  baseUrl: 'https://rochester.wd5.myworkdayjobs.com',
  instance: 'UR_Staff',
};

export class UniversityOfRochesterScraper extends BaseScraper {
  readonly employerKey = 'university-of-rochester';

  async scrape(context?: ScrapeContext): Promise<ScrapedJob[]> {
    return fetchWorkdayJobs(
      WD_CONFIG,
      config.scraper.userAgent,
      config.scraper.timeoutMs,
      config.scraper.requestIntervalMs,
      config.scraper.maxRetryAttempts,
      config.scraper.retryBaseDelayMs,
      context,
      true, // enrichDetails: fetch individual job pages for description, salary, department
      config.scraper.detailIntervalMs,
    );
  }
}

export const universityOfRochesterScraper = new UniversityOfRochesterScraper();

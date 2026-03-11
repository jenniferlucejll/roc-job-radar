// ATS: Workday
// Career page: https://www.rochester.edu/careers/
// Workday tenant: rochester.wd5.myworkdayjobs.com
// API: POST https://rochester.wd5.myworkdayjobs.com/wday/cxs/rochester/UR_Staff/jobs
// externalId: Workday jobPostingId (e.g. "R257069")
// Scraping: Workday JSON API (POST with pagination)
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper } from '../base.js';
import { fetchWorkdayJobs } from '../workday.js';

const WD_CONFIG = {
  apiUrl: 'https://rochester.wd5.myworkdayjobs.com/wday/cxs/rochester/UR_Staff/jobs',
  baseUrl: 'https://rochester.wd5.myworkdayjobs.com',
};

export class UniversityOfRochesterScraper extends BaseScraper {
  readonly employerKey = 'university-of-rochester';

  async scrape(): Promise<ScrapedJob[]> {
    return fetchWorkdayJobs(WD_CONFIG, config.scraper.userAgent, config.scraper.timeoutMs);
  }
}

export const universityOfRochesterScraper = new UniversityOfRochesterScraper();

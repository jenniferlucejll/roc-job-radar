/** A job returned by a scraper adapter before persistence. */
export interface ScrapedJob {
  /** Stable identifier for this job within the employer's system (URL by default, ATS ID preferred). */
  externalId: string;
  title: string;
  url: string;
  location?: string;
  remoteStatus?: 'remote' | 'hybrid' | 'onsite';
  department?: string;
  descriptionHtml?: string;
  salaryRaw?: string;
  datePostedAt?: Date;
}

/** Summary returned by the scrape pipeline after a full run. */
export interface ScrapeResult {
  runId: string;
  startedAt: Date;
  finishedAt: Date;
  employersRun: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRemoved: number;
  errors: number;
  employers: ScrapeEmployerSummary[];
}

export interface ScrapeEmployerSummary {
  employerId: number;
  employerKey: string;
  employerName: string;
  status: 'success' | 'missing_adapter' | 'robots_blocked' | 'error';
  jobsScraped: number;
  jobsFiltered: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRemoved: number;
  errors: ScrapeErrorDetail[];
}

export interface ScrapeErrorDetail {
  errorType: string;
  message: string;
}

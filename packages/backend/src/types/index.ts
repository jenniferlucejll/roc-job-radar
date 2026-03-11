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
  startedAt: Date;
  finishedAt: Date;
  employersRun: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRemoved: number;
  errors: number;
}

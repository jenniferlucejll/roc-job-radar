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
  status: ScrapeRunStatus;
  employersRun: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRemoved: number;
  errors: number;
  requestAttempts: number;
  retryAttempts: number;
  openErrors: number;
  employers: ScrapeEmployerSummary[];
}

export interface ScrapeRunSummary {
  runId: string;
  status: ScrapeRunStatus;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  employersRun: number;
  jobsInserted: number;
  jobsUpdated: number;
  jobsRemoved: number;
  errors: number;
  requestAttempts: number;
  retryAttempts: number;
  openErrors: number;
}

export type ScrapeRunStatus = 'running' | 'success' | 'partial_error' | 'failed';

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
  requestAttempts: number;
  retryAttempts: number;
  unresolvedErrors: number;
  errors: ScrapeErrorDetail[];
}

export interface ScrapeErrorDetail {
  errorType: string;
  message: string;
}

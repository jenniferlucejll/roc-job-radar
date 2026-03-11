import type { ScrapedJob } from '../types/index.js';

export interface ScrapeContext {
  onRequestAttempt?: (info: {
    attempt: number;
    maxAttempts: number;
    url: string;
  }) => void;
}

export abstract class BaseScraper {
  /** Matches the `key` column in the `employers` table. */
  abstract readonly employerKey: string;

  /** Fetch and return all currently active jobs for this employer. */
  abstract scrape(context?: ScrapeContext): Promise<ScrapedJob[]>;
}

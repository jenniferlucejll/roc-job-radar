import type { ScrapedJob } from '../types/index.js';

export abstract class BaseScraper {
  /** Matches the `key` column in the `employers` table. */
  abstract readonly employerKey: string;

  /** Fetch and return all currently active jobs for this employer. */
  abstract scrape(): Promise<ScrapedJob[]>;
}

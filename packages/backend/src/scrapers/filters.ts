import type { ScrapedJob } from '../types/index.js';

/**
 * Department substrings that identify a tech role regardless of keywords.
 * Case-insensitive substring match against job.department.
 */
export const TECH_DEPARTMENTS = [
  'engineering',
  'technology',
  'information technology',
  'software',
  'data',
  'devops',
  'cloud',
  'security',
  'infrastructure',
  'platform',
  'sre',
];

/**
 * A job passes the filter if either:
 *   1. Its department matches a tech department (substring, case-insensitive), OR
 *   2. Its title or description contains at least one active keyword.
 *
 * @param job - The scraped job to evaluate.
 * @param keywords - Active keywords from the keyword_filters table.
 * @param departments - Department allowlist (defaults to TECH_DEPARTMENTS).
 */
export function passesFilter(
  job: ScrapedJob,
  keywords: string[],
  departments: string[] = TECH_DEPARTMENTS,
): boolean {
  if (job.department) {
    const dept = job.department.toLowerCase();
    if (departments.some((d) => dept.includes(d.toLowerCase()))) return true;
  }

  const searchText = [job.title, job.descriptionHtml ?? ''].join(' ').toLowerCase();
  return keywords.some((kw) => searchText.includes(kw.toLowerCase()));
}

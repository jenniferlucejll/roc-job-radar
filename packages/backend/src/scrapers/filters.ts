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

const GREATEST_ROCHESTER_SUBURBS = new Set([
  'east rochester',
  'henrietta',
  'west henrietta',
  'hamlin',
  'greece',
  'webster',
  'brighton',
  'irondequoit',
  'fairport',
  'churchville',
  'penfield',
  'chili',
  'pittsford',
  'mendon',
  'perinton',
  'scottsville',
  'winton shores',
  'spencerport',
]);

function normalizeLocationText(location: string): string {
  return location
    .toLowerCase()
    .replace(/\bn\.?\s*y\.?\b/g, 'ny')
    .replace(/[^a-z0-9,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeLocation(location: string): string[] {
  const normalized = normalizeLocationText(location);
  return normalized ? normalized.split(/[^a-z0-9]+/).filter(Boolean) : [];
}

function hasNewYorkIndicator(tokens: string[]): boolean {
  return tokens.includes('ny') || (tokens.includes('new') && tokens.includes('york'));
}

/**
 * Returns true only for strict Rochester metro area matches:
 * - Rochester, NY / Rochester, New York
 * - Monroe County, NY / Monroe County, New York
 * - Explicit suburbs (Henrietta, Greece, etc.) in NY
 */
export function isInGreaterRochester(location: string | undefined): boolean {
  if (!location || !location.trim()) return false;

  const normalized = normalizeLocationText(location);
  if (!normalized) return false;

  const tokens = tokenizeLocation(location);
  if (tokens.length === 0 || !hasNewYorkIndicator(tokens)) {
    return false;
  }

  const firstSegment = normalized.split(',')[0]?.trim() ?? '';
  if (!firstSegment) return false;

  if (firstSegment === 'rochester') return true;
  if (/^rochester(?:\s+ny|(?:\s+new\s+york)?)?$/.test(firstSegment)) return true;

  if (firstSegment === 'monroe county' || firstSegment === 'monroe county ny') return true;

  if (firstSegment.startsWith('rochester ') || firstSegment.endsWith(' rochester')) {
    return false;
  }

  if (GREATEST_ROCHESTER_SUBURBS.has(firstSegment)) {
    return true;
  }

  return false;
}

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

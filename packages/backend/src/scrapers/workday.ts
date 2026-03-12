import type { ScrapedJob } from '../types/index.js';
import { createRequestThrottler } from './requestThrottle.js';
import { fetchWithRetry } from './requestRetry.js';
import type { ScrapeContext } from './base.js';

export interface WorkdayConfig {
  /** Full POST endpoint, e.g. https://rochester.wd5.myworkdayjobs.com/wday/cxs/rochester/UR_Staff/jobs */
  apiUrl: string;
  /** Scheme + host used to build job URLs, e.g. https://rochester.wd5.myworkdayjobs.com */
  baseUrl: string;
  /** Workday instance/site ID, e.g. "UR_Staff" — required when enrichDetails is true */
  instance?: string;
}

const LIMIT = 20;

interface WorkdayPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
  bulletFields?: string[];
  postedOn?: string;
  remoteType?: string;
}

interface WorkdayResponse {
  jobPostings: WorkdayPosting[];
  total: number;
}

interface WorkdayDetailResponse {
  jobPostingInfo?: {
    jobDescription?: string;
    timeType?: string;
    postedOn?: string;
    startDate?: string;
    jobReqId?: string;
    jobPostingId?: string;
  };
}

interface WorkdaySession {
  cookie: string;
  csrfToken: string;
}

/**
 * Parse a Workday "Posted N Days Ago" / "Posted Today" / "Posted Yesterday" string
 * into an approximate Date. Returns undefined if the format is unrecognised.
 */
export function parsePostedOn(postedOn: string): Date | undefined {
  const lower = postedOn.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lower.includes('today')) return today;

  if (lower.includes('yesterday')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d;
  }

  const daysMatch = lower.match(/(\d+)\s+days?\s+ago/);
  if (daysMatch) {
    const d = new Date(today);
    d.setDate(d.getDate() - parseInt(daysMatch[1], 10));
    return d;
  }

  const monthsMatch = lower.match(/(\d+)\s+months?\s+ago/);
  if (monthsMatch) {
    const d = new Date(today);
    d.setMonth(d.getMonth() - parseInt(monthsMatch[1], 10));
    return d;
  }

  return undefined;
}

/**
 * Map Workday's remoteType string to our canonical remoteStatus values.
 */
function parseRemoteType(remoteType?: string): 'remote' | 'hybrid' | 'onsite' | undefined {
  if (!remoteType) return undefined;
  const lower = remoteType.toLowerCase();
  if (lower.includes('remote') && !lower.includes('hybrid')) return 'remote';
  if (lower.includes('hybrid')) return 'hybrid';
  if (lower.includes('on-site') || lower.includes('on site') || lower.includes('onsite')) return 'onsite';
  return undefined;
}

/**
 * Establish a Workday session by hitting the main careers page.
 * Returns cookies and CSRF token needed for authenticated detail API calls.
 */
async function getWorkdaySession(
  config: WorkdayConfig,
  userAgent: string,
  timeoutMs: number,
): Promise<WorkdaySession> {
  const instance = config.instance ?? 'careers';
  const sessionUrl = `${config.baseUrl}/en-US/${instance}`;

  const resp = await fetch(sessionUrl, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  // Safety: mocked fetch responses in tests may not return a proper Response.
  if (!resp) {
    throw new Error('Session fetch returned no response');
  }

  // getSetCookie() returns individual Set-Cookie header values (Node 18+).
  // Use any cast + optional chaining so mocked fetch responses in tests don't throw.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSetCookie = (resp.headers as any)?.getSetCookie;
  const setCookieHeaders: string[] =
    typeof getSetCookie === 'function' ? (getSetCookie.call(resp.headers) as string[]) : [];

  const cookiePairs = setCookieHeaders.map((h) => h.split(';')[0]);
  const cookie = cookiePairs.join('; ');
  const csrfToken =
    cookiePairs
      .find((c) => c.startsWith('CALYPSO_CSRF_TOKEN='))
      ?.split('=')[1] ?? '';

  return { cookie, csrfToken };
}

/**
 * Fetch a single Workday job detail page and return enrichment data.
 * Uses the authenticated CXS detail endpoint:
 *   GET /wday/cxs/{company}/{instance}/job/{jobPostingId}
 */
async function fetchWorkdayJobDetail(
  detailBaseUrl: string,
  jobPostingId: string,
  jobPageUrl: string,
  session: WorkdaySession,
  userAgent: string,
  timeoutMs: number,
): Promise<WorkdayDetailResponse> {
  const url = `${detailBaseUrl}/job/${jobPostingId}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent,
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': session.cookie,
      'x-calypso-csrf-token': session.csrfToken,
      'Referer': jobPageUrl,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    throw new Error(`Workday detail request failed: HTTP ${resp.status}`);
  }

  return (await resp.json()) as WorkdayDetailResponse;
}

/**
 * Extract salary range text from Workday job description HTML.
 * The HTML embeds compensation as: "Compensation Range:</p>$X.XX - $Y.YY"
 */
function extractSalaryFromDescription(descHtml: string): string | undefined {
  const match = descHtml.match(/Compensation Range:<\/p>([^<]+)/);
  return match?.[1]?.trim() || undefined;
}

/**
 * Extract department from Workday job description HTML.
 * The HTML embeds department as: "Department:</p>123456 Dept Name"
 */
function extractDepartmentFromDescription(descHtml: string): string | undefined {
  const match = descHtml.match(/Department:<\/p>([^<]+)/);
  return match?.[1]?.trim() || undefined;
}

/**
 * Fetch all job postings from a Workday careers JSON API.
 * Paginates automatically until all postings are retrieved.
 *
 * When enrichDetails is true, fetches each job's detail page after the listing
 * to populate description, salary, and department. Detail requests are made
 * sequentially with a configurable delay to avoid hammering the site.
 */
export async function fetchWorkdayJobs(
  wdConfig: WorkdayConfig,
  userAgent: string,
  timeoutMs: number,
  requestIntervalMs = 1000,
  maxRetryAttempts = 3,
  retryBaseDelayMs = 1000,
  context?: ScrapeContext,
  enrichDetails = false,
  detailIntervalMs = 3000,
): Promise<ScrapedJob[]> {
  const throttler = createRequestThrottler(requestIntervalMs);
  const all: ScrapedJob[] = [];
  let offset = 0;
  let total: number | null = null;

  while (true) {
    await throttler.waitForNextSlot();

    let data: WorkdayResponse;
    try {
      data = await fetchWithRetry(
        wdConfig.apiUrl,
        async (res) => (await res.json()) as WorkdayResponse,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
          },
          body: JSON.stringify({
            appliedFacets: {},
            limit: LIMIT,
            offset,
            searchText: '',
          }),
          timeoutMs,
          maxAttempts: maxRetryAttempts,
          baseDelayMs: retryBaseDelayMs,
          onAttempt: context?.onRequestAttempt,
        },
      );
    } catch (err) {
      // Pagination failed mid-way — return whatever we collected so far rather
      // than discarding it entirely. The caller will log the error.
      if (all.length > 0) {
        console.warn(`[workday] Pagination error at offset ${offset} (${all.length} jobs collected so far), returning partial results:`, err);
        return all;
      }
      throw err;
    }

    const pageCount = data.jobPostings.length;
    if (Number.isFinite(data.total) && data.total > 0) {
      total = total === null ? data.total : Math.max(total, data.total);
    }

    for (const p of data.jobPostings) {
      // Extract the requisition ID from the end of externalPath (e.g. "_R261316")
      // Fall back to the full path if the pattern doesn't match.
      const idMatch = p.externalPath.match(/_([A-Z0-9]+(?:-\d+)?)$/);
      const externalId = idMatch ? idMatch[1] : p.externalPath;

      const job: ScrapedJob = {
        externalId,
        title: p.title,
        url: `${wdConfig.baseUrl}/en-US${p.externalPath}`,
        location: p.locationsText?.trim() || undefined,
        remoteStatus: parseRemoteType(p.remoteType),
        datePostedAt: p.postedOn ? parsePostedOn(p.postedOn) : undefined,
        // jobPostingId (last path segment) stored temporarily for detail lookup
        // department not available from the Workday listing API
      };
      // Store the jobPostingId as a private property for detail enrichment
      (job as ScrapedJob & { _jobPostingId?: string })._jobPostingId =
        p.externalPath.split('/').pop();
      all.push(job);
    }

    if (pageCount === 0) {
      break;
    }

    offset += pageCount;

    if (total !== null && offset >= total) {
      break;
    }

    if (pageCount < LIMIT) {
      break;
    }
  }

  if (!enrichDetails || all.length === 0) {
    return all;
  }

  // ---------------------------------------------------------------------------
  // Detail enrichment: establish a session then fetch each job detail page
  // sequentially with a generous delay to be polite to the server.
  // ---------------------------------------------------------------------------

  // Derive the detail API base from the listing apiUrl:
  //   .../wday/cxs/company/instance/jobs  →  .../wday/cxs/company/instance
  const detailBaseUrl = wdConfig.apiUrl.replace(/\/jobs$/, '');

  let session: WorkdaySession;
  try {
    session = await getWorkdaySession(wdConfig, userAgent, timeoutMs);
    if (!session.csrfToken) {
      console.warn('[workday] Could not obtain CSRF token — skipping detail enrichment');
      return all;
    }
  } catch (err) {
    console.warn('[workday] Session establishment failed — skipping detail enrichment:', err);
    return all;
  }

  const detailThrottler = createRequestThrottler(detailIntervalMs);

  for (const job of all) {
    const jobWithId = job as ScrapedJob & { _jobPostingId?: string };
    const jobPostingId = jobWithId._jobPostingId;
    delete jobWithId._jobPostingId;

    if (!jobPostingId) continue;

    await detailThrottler.waitForNextSlot();

    const jobPageUrl = job.url;

    try {
      const detail = await fetchWorkdayJobDetail(
        detailBaseUrl,
        jobPostingId,
        jobPageUrl,
        session,
        userAgent,
        timeoutMs,
      );

      const info = detail.jobPostingInfo;
      if (!info) continue;

      if (info.jobDescription) {
        job.descriptionHtml = info.jobDescription;
        const salary = extractSalaryFromDescription(info.jobDescription);
        if (salary) job.salaryRaw = salary;
        const dept = extractDepartmentFromDescription(info.jobDescription);
        if (dept) job.department = dept;
      }

      // Prefer the ISO startDate from detail over the relative postedOn from listing
      if (info.startDate) {
        job.datePostedAt = new Date(info.startDate);
      } else if (info.postedOn && !job.datePostedAt) {
        job.datePostedAt = parsePostedOn(info.postedOn);
      }
    } catch (err) {
      console.warn(`[workday] Detail fetch failed for ${jobPostingId} — skipping:`, err);
    }
  }

  return all;
}

/**
 * ATS: unknown / custom career portal
 * Career page: https://www.esl.org/about-esl/careers
 * externalId: data-job-id, data-id, query param req_id, or URL tail
 * scraping: fetch + cheerio with JSON-LD + HTML fallback parsing
 */
import { load } from 'cheerio';
import { config } from '../../config.js';
import type { ScrapedJob } from '../../types/index.js';
import { BaseScraper } from '../base.js';
import { fetchWithRetry } from '../requestRetry.js';

const CAREERS_URL = 'https://www.esl.org/about-esl/careers';

interface CheerioAnchorLike {
  attr(name: string): string | undefined;
  text(): string;
  find(selector: string): CheerioAnchorLike;
  parent(): CheerioAnchorLike;
  siblings(selector: string): CheerioAnchorLike;
  closest(selector: string): CheerioAnchorLike;
  hasClass(className: string): boolean;
  length?: number;
  first(): CheerioAnchorLike;
  html(): string | null;
}

export class EslScraper extends BaseScraper {
  readonly employerKey = 'esl';

  async scrape(): Promise<ScrapedJob[]> {
    const html = await fetchWithRetry(
      CAREERS_URL,
      async (res) => res.text(),
      {
        headers: { 'User-Agent': config.scraper.userAgent },
        timeoutMs: config.scraper.timeoutMs,
        maxAttempts: config.scraper.maxRetryAttempts,
        baseDelayMs: config.scraper.retryBaseDelayMs,
      },
    );

    const $ = load(html);
    const results: ScrapedJob[] = [];
    const byId = new Map<string, ScrapedJob>();

    for (const raw of parseJsonLdJobs($)) {
      byId.set(raw.externalId, raw);
    }

    $('a').each((_idx, anchor) => {
      const $a = $(anchor);
      const title = (
        $a.find('h1, h2, h3, h4').first().text().trim()
        || $a.attr('aria-label')
        || $a.text().trim()
      );
      const href = $a.attr('href');
      if (!title || !href || !href.startsWith('http') && !href.startsWith('/')) {
        return;
      }
      const hrefLower = href.toLowerCase();
      const isJobLikeHref = hrefLower.includes('/job') || hrefLower.includes('/career');
      const hasJobHint = Boolean(
        $a.attr('data-job-id') || $a.attr('data-id') || $a.attr('data-requisition-id'),
      );
      const isJobLikeNode =
        $a.hasClass('job')
        || ($a.closest('.job').length ?? 0) > 0
        || ($a.closest('.job-card').length ?? 0) > 0
        || ($a.closest('.position').length ?? 0) > 0;

      if (!isJobLikeHref && !hasJobHint && !isJobLikeNode) {
        return;
      }

      const url = href.startsWith('http') ? href : `https://www.esl.org${href}`;
      const externalId = resolveExternalId(url, $a);
      if (!externalId) {
        return;
      }

      const description = findAnchorDescription($a);
      const locationText = (
        $a.attr('data-location')
        || $a.find('.job-location').first().text()
        || $a.parent().find('.location').first().text()
      ).trim();
      const department = (
        $a.attr('data-department')
        || $a.find('.job-dept').first().text()
      ).trim();

      byId.set(externalId, {
        externalId,
        title,
        url,
        location: locationText || undefined,
        department: department || undefined,
        descriptionHtml: description || undefined,
        remoteStatus: extractRemoteStatus($a.attr('data-work-arrangement') || title),
      });
    });

    for (const value of byId.values()) {
      results.push(value);
    }

    return results;
  }
}

function parseJsonLdJobs($: ReturnType<typeof load>): ScrapedJob[] {
  const results: ScrapedJob[] = [];

  $('script[type="application/ld+json"]').each((_idx, script) => {
    const rawText = $(script).text();
    if (!rawText.trim()) return;

    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return;
    }

    extractJobsFromJson(payload, results);
  });

  return results;
}

function extractJobsFromJson(node: unknown, out: ScrapedJob[]): void {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      extractJobsFromJson(item, out);
    }
    return;
  }

  if (typeof node !== 'object') return;
  const value = node as Record<string, unknown>;

  if (Array.isArray(value['@graph'])) {
    extractJobsFromJson(value['@graph'], out);
  }

  if (value['@type'] === 'JobPosting') {
    const title = typeof value.title === 'string' ? value.title : undefined;
    const url = typeof value.url === 'string' ? value.url : undefined;
    if (title && url) {
      const descriptionHtml = typeof value.description === 'string' ? value.description : undefined;
      const location = extractJobLocation(value['jobLocation']);
      const remoteText =
        typeof value.hiringOrganization === 'object' && value.hiringOrganization && typeof (value.hiringOrganization as Record<string, unknown>).name === 'string'
          ? `Hiring organization: ${(value.hiringOrganization as Record<string, unknown>).name}`
          : title;

      out.push({
        externalId: resolveExternalId(url, undefined),
        title,
        url,
        location,
        descriptionHtml,
        remoteStatus: extractRemoteStatus(remoteText),
      });
    }
    return;
  }
}

function extractJobLocation(jobLocation: unknown): string | undefined {
  if (!jobLocation || typeof jobLocation !== 'object') return undefined;
  const loc = jobLocation as { address?: unknown };
  if (typeof loc.address === 'string') return loc.address.trim();
  if (!loc.address || typeof loc.address !== 'object') return undefined;

  const address = loc.address as Record<string, unknown>;
  const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());

  return parts.length > 0 ? parts.join(', ') : undefined;
}

function extractRemoteStatus(value: string): ScrapedJob['remoteStatus'] | undefined {
  const lowered = value.toLowerCase();
  if (lowered.includes('remote')) return 'remote';
  if (lowered.includes('hybrid')) return 'hybrid';
  if (
    lowered.includes('on-site')
    || lowered.includes('onsite')
    || lowered.includes('in office')
    || lowered.includes('local')
  ) {
    return 'onsite';
  }
  return undefined;
}

function resolveExternalId(url: string, $el?: CheerioAnchorLike): string {
  if ($el) {
    const dataId = $el.attr('data-job-id') ?? $el.attr('data-id') ?? $el.attr('data-requisition-id');
    if (dataId && dataId.trim().length > 0) return dataId.trim();
    const reqId = new URL(url).searchParams.get('req_id');
    if (reqId && reqId.trim().length > 0) return reqId.trim();
  }

  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
    if (tail && tail !== 'careers') {
      return tail;
    }
  } catch {
    // ignore malformed URLs
  }

  return url;
}

function findAnchorDescription($a: CheerioAnchorLike): string {
  return (
    $a.attr('data-description')
    || $a.find('.job-description').first().html()
    || $a.parent().find('.description, .job-summary').first().html()
    || $a.siblings('.job-description').first().html()
    || ''
  ).replace(/\s+/g, ' ').trim();
}

export const eslScraper = new EslScraper();

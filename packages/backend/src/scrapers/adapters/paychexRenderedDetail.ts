import { accessSync, constants } from 'fs';
import { chromium, type Browser, type Frame, type Page } from 'playwright-core';
import type { ScrapedJob } from '../../types/index.js';

const PAYCHEX_DESCRIPTION_MARKERS = [
  'overview',
  'responsibilities',
  'qualifications',
  'compensation',
  "what's in it for you?",
];

const DEFAULT_EXECUTABLE_PATHS = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((path): path is string => Boolean(path));

let browserPromise: Promise<Browser> | undefined;

export async function fetchPaychexRenderedJobDetail(
  jobUrl: string,
  userAgent: string,
  timeoutMs: number,
): Promise<Partial<ScrapedJob>> {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();

  try {
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const root = await resolvePaychexContentRoot(page, timeoutMs);
    await waitForDescriptionMarkers(root, timeoutMs);
    const descriptionHtml = await extractDescriptionHtml(root);

    if (!descriptionHtml) {
      throw new Error('Rendered Paychex detail page did not expose a job description container');
    }

    return { descriptionHtml };
  } finally {
    await page.close();
    await context.close();
  }
}

async function getBrowser(): Promise<Browser> {
  browserPromise ??= launchBrowser();

  return browserPromise;
}

function resolveChromiumExecutablePath(): string {
  for (const executablePath of DEFAULT_EXECUTABLE_PATHS) {
    try {
      accessSync(executablePath, constants.X_OK);
      return executablePath;
    } catch {
      continue;
    }
  }

  throw new Error('Could not find a Chromium executable for Paychex rendered detail scraping');
}

async function launchBrowser(): Promise<Browser> {
  try {
    const browser = await chromium.launch({
      executablePath: resolveChromiumExecutablePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    browser.on('disconnected', () => {
      browserPromise = undefined;
    });

    return browser;
  } catch (error) {
    browserPromise = undefined;
    throw error;
  }
}

async function resolvePaychexContentRoot(page: Page, timeoutMs: number): Promise<Page | Frame> {
  const iframeLocator = page.locator('#icims_content_iframe');
  try {
    await iframeLocator.waitFor({ state: 'attached', timeout: timeoutMs });
    const iframeHandle = await iframeLocator.elementHandle();
    const iframe = await iframeHandle?.contentFrame();
    if (iframe) {
      await iframe.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
      return iframe;
    }
  } catch {
    // Fall back to the outer page if the iframe is absent or inaccessible.
  }

  return page;
}

async function waitForDescriptionMarkers(root: Page | Frame, timeoutMs: number): Promise<void> {
  await root.waitForFunction(
    (markers) => {
      const text = document.body?.innerText?.toLowerCase() ?? '';
      const matches = markers.filter((marker) => text.includes(marker)).length;
      return matches >= 2 && text.length > 1000;
    },
    PAYCHEX_DESCRIPTION_MARKERS,
    { timeout: timeoutMs },
  );
}

async function extractDescriptionHtml(root: Page | Frame): Promise<string | null> {
  return root.evaluate((markers) => {
    const cleanupSelector = [
      'script',
      'style',
      'noscript',
      'svg',
      'button',
      'form',
      'nav',
      'header',
      'footer',
    ].join(',');
    const paychexChromeSelector = [
      '.iCIMS_JobOptions',
      '.iCIMS_PageFooter',
      '.iCIMS_Logo',
      '#popupOverlay',
      '#jobSocialOptions',
      '#jobSocialOptionsErrMsg',
      '#mobileShowSocialOptionsButton',
      '#jobOptionsMobile',
    ].join(',');

    const candidateElements = Array.from(document.querySelectorAll('main, article, section, div'));
    const candidates = candidateElements
      .map((element) => {
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        const text = (element.innerText || '').replace(/\s+/g, ' ').trim();
        if (text.length < 800) {
          return null;
        }

        const lower = text.toLowerCase();
        const markerCount = markers.filter((marker) => lower.includes(marker)).length;
        if (markerCount < 2) {
          return null;
        }

        let penalty = 0;
        if (lower.includes('search jobs')) penalty += 2;
        if (lower.includes('job alerts')) penalty += 1;
        if (lower.includes('careers home')) penalty += 2;
        if (lower.includes('similar jobs')) penalty += 1;
        if (lower.includes('returning candidate')) penalty += 1;

        return {
          element,
          textLength: text.length,
          score: markerCount * 100 - penalty * 50 - text.length / 200,
        };
      })
      .filter((candidate): candidate is {
        element: HTMLElement;
        textLength: number;
        score: number;
      } => candidate !== null)
      .sort((left, right) => right.score - left.score || left.textLength - right.textLength);

    const best = candidates[0]?.element;
    if (!best) {
      return null;
    }

    const clone = best.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      return null;
    }
    clone.querySelectorAll(cleanupSelector).forEach((node) => node.remove());
    clone.querySelectorAll(paychexChromeSelector).forEach((node) => node.remove());
    const html = clone.innerHTML.trim();
    return html || null;
  }, PAYCHEX_DESCRIPTION_MARKERS);
}

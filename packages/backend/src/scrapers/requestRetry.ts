import { sleep } from './requestThrottle.js';

export type RetryParseFn<T> = (res: Response) => Promise<T>;

interface RequestRetryOptions {
  timeoutMs: number;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  maxAttempts?: number;
  baseDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;

export async function fetchWithRetry<T>(
  url: string,
  parseResponse: RetryParseFn<T>,
  options: RequestRetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      let response: Response;

      try {
        response = await fetch(url, {
          method: options.method,
          headers: options.headers,
          body: options.body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const delayMs = baseDelayMs * attempt;
        lastError = new Error(`Request failed with status ${response.status}`);
        await sleep(delayMs);
        continue;
      }

      return await parseResponse(response);
    } catch (error: unknown) {
      lastError = error;

      if (isRetryableError(error) && attempt < maxAttempts) {
        await sleep(baseDelayMs * attempt);
        continue;
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Request failed: ${String(error)}`);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Request failed with unknown error');
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const message = err.message.toLowerCase();
  return message.includes('fetch') || message.includes('network') || message.includes('econnrefused') || message.includes('aborted');
}

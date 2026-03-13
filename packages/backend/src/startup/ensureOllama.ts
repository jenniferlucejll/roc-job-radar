import { config } from '../config.js';

const POLL_INTERVAL_MS = 1_000;

interface OllamaTagResponse {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildOllamaUrl(pathname: string): string {
  const url = new URL(config.scraper.ai.apiUrl);
  const path = url.pathname;
  const apiIndex = path.indexOf('/api/');
  const basePath = apiIndex >= 0 ? path.slice(0, apiIndex) : '';
  url.pathname = `${basePath}${pathname}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForOllamaApi(deadlineAt: number): Promise<void> {
  const tagsUrl = buildOllamaUrl('/api/tags');
  let lastError = 'unknown error';

  while (Date.now() < deadlineAt) {
    try {
      const response = await fetchWithTimeout(tagsUrl, { method: 'GET' }, POLL_INTERVAL_MS);
      if (response.ok) {
        return;
      }

      lastError = `unexpected status ${response.status}`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for Ollama API at ${tagsUrl}: ${lastError}`);
}

async function listModelsWithRetry(deadlineAt: number): Promise<string[]> {
  const tagsUrl = buildOllamaUrl('/api/tags');
  let lastError = 'unknown error';

  while (Date.now() < deadlineAt) {
    const remainingMs = Math.max(1, Math.min(POLL_INTERVAL_MS, deadlineAt - Date.now()));

    try {
      const response = await fetchWithTimeout(tagsUrl, { method: 'GET' }, remainingMs);
      if (!response.ok) {
        lastError = `Ollama tags request failed with status ${response.status}`;
      } else {
        const payload = await response.json() as OllamaTagResponse;
        return (payload.models ?? [])
          .flatMap((entry) => [entry.name, entry.model])
          .filter((value): value is string => Boolean(value));
      }
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out listing Ollama models at ${tagsUrl}: ${lastError}`);
}

function matchesModel(installed: string[], expected: string): boolean {
  return installed.some((name) => name === expected || name.startsWith(`${expected}:`));
}

async function pullModel(model: string): Promise<void> {
  const response = await fetchWithTimeout(
    buildOllamaUrl('/api/pull'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false }),
    },
    config.scraper.ai.readyTimeoutMs,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama model pull failed with status ${response.status}: ${body}`);
  }
}

export async function ensureOllamaReady(): Promise<void> {
  if (!config.scraper.ai.enabled) {
    console.log('[startup] AI disabled; skipping Ollama readiness check');
    return;
  }

  const apiDeadlineAt = Date.now() + config.scraper.ai.readyTimeoutMs;
  const modelDeadlineAt = Date.now() + config.scraper.ai.pullTimeoutMs;
  const model = config.scraper.ai.model;
  console.log(`[startup] Ensuring Ollama model "${model}" is ready`);

  await waitForOllamaApi(apiDeadlineAt);

  const installedModels = await listModelsWithRetry(modelDeadlineAt);
  if (matchesModel(installedModels, model)) {
    console.log(`[startup] Ollama model "${model}" is already available`);
    return;
  }

  console.log(`[startup] Ollama model "${model}" missing; pulling now`);
  await pullModel(model);

  const refreshedModels = await listModelsWithRetry(modelDeadlineAt);
  if (!matchesModel(refreshedModels, model)) {
    throw new Error(`Ollama model "${model}" was pulled but is still not available`);
  }

  console.log(`[startup] Ollama model "${model}" is ready`);
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href) {
  ensureOllamaReady().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[startup] ${message}`);
    process.exit(1);
  });
}

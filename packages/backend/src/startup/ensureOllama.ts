import { config } from '../config.js';

const POLL_INTERVAL_MS = 1_000;

interface OllamaTagResponse {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
}

export type AiRuntimeState = 'disabled' | 'initializing' | 'ready' | 'degraded';

export interface AiRuntimeStatus {
  enabled: boolean;
  state: AiRuntimeState;
  model: string;
  apiReachable: boolean | null;
  modelAvailable: boolean | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  lastReadyAt: string | null;
}

let status: AiRuntimeStatus = {
  enabled: config.scraper.ai.enabled,
  state: config.scraper.ai.enabled ? 'initializing' : 'disabled',
  model: config.scraper.ai.model,
  apiReachable: null,
  modelAvailable: null,
  lastError: null,
  lastCheckedAt: null,
  lastReadyAt: null,
};

let monitorStarted = false;
let monitorTimer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

function updateStatus(next: Partial<AiRuntimeStatus>): void {
  status = {
    ...status,
    ...next,
  };
}

function nowIso(): string {
  return new Date().toISOString();
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
    config.scraper.ai.pullTimeoutMs,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama model pull failed with status ${response.status}: ${body}`);
  }
}

function scheduleNextRun(): void {
  if (!config.scraper.ai.enabled) {
    return;
  }

  monitorTimer = setTimeout(() => {
    void runAiReadinessCheck();
  }, Math.max(1_000, config.scraper.ai.retryIntervalMs));
}

export function getAiRuntimeStatus(): AiRuntimeStatus {
  return { ...status };
}

export async function ensureOllamaReady(): Promise<void> {
  if (!config.scraper.ai.enabled) {
    updateStatus({
      enabled: false,
      state: 'disabled',
      apiReachable: null,
      modelAvailable: null,
      lastError: null,
      lastCheckedAt: nowIso(),
    });
    console.log('[startup] AI disabled; skipping Ollama readiness check');
    return;
  }

  updateStatus({
    enabled: true,
    state: 'initializing',
    model: config.scraper.ai.model,
    lastCheckedAt: nowIso(),
  });

  const apiDeadlineAt = Date.now() + config.scraper.ai.readyTimeoutMs;
  const modelDeadlineAt = Date.now() + config.scraper.ai.pullTimeoutMs;
  const model = config.scraper.ai.model;
  console.log(`[startup] Ensuring Ollama model "${model}" is ready`);

  await waitForOllamaApi(apiDeadlineAt);
  updateStatus({
    apiReachable: true,
  });

  const installedModels = await listModelsWithRetry(modelDeadlineAt);
  if (matchesModel(installedModels, model)) {
    updateStatus({
      state: 'ready',
      modelAvailable: true,
      lastError: null,
      lastCheckedAt: nowIso(),
      lastReadyAt: nowIso(),
    });
    console.log(`[startup] Ollama model "${model}" is already available`);
    return;
  }

  updateStatus({
    modelAvailable: false,
  });
  console.log(`[startup] Ollama model "${model}" missing; pulling now`);
  await pullModel(model);

  const refreshedModels = await listModelsWithRetry(modelDeadlineAt);
  if (!matchesModel(refreshedModels, model)) {
    throw new Error(`Ollama model "${model}" was pulled but is still not available`);
  }

  updateStatus({
    state: 'ready',
    modelAvailable: true,
    lastError: null,
    lastCheckedAt: nowIso(),
    lastReadyAt: nowIso(),
  });
  console.log(`[startup] Ollama model "${model}" is ready`);
}

export async function runAiReadinessCheck(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }

  if (monitorTimer) {
    clearTimeout(monitorTimer);
    monitorTimer = null;
  }

  inFlight = ensureOllamaReady()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus({
        enabled: config.scraper.ai.enabled,
        state: config.scraper.ai.enabled ? 'degraded' : 'disabled',
        apiReachable: message.includes('waiting for Ollama API') ? false : status.apiReachable,
        modelAvailable: message.includes('model') ? false : status.modelAvailable,
        lastError: message,
        lastCheckedAt: nowIso(),
      });
      console.error(`[startup] AI degraded: ${message}`);
    })
    .finally(() => {
      inFlight = null;
      if (monitorStarted) {
        scheduleNextRun();
      }
    });

  return inFlight;
}

export function startAiReadinessMonitor(): void {
  if (monitorStarted) {
    return;
  }

  monitorStarted = true;
  if (!config.scraper.ai.enabled) {
    updateStatus({
      enabled: false,
      state: 'disabled',
      lastCheckedAt: nowIso(),
    });
    console.log('[startup] AI disabled; backend startup will continue without Ollama');
    return;
  }

  updateStatus({
    enabled: true,
    state: 'initializing',
    model: config.scraper.ai.model,
    lastError: null,
  });

  void runAiReadinessCheck();
}

export function stopAiReadinessMonitorForTests(): void {
  monitorStarted = false;
  if (monitorTimer) {
    clearTimeout(monitorTimer);
    monitorTimer = null;
  }
  inFlight = null;
  status = {
    enabled: config.scraper.ai.enabled,
    state: config.scraper.ai.enabled ? 'initializing' : 'disabled',
    model: config.scraper.ai.model,
    apiReachable: null,
    modelAvailable: null,
    lastError: null,
    lastCheckedAt: null,
    lastReadyAt: null,
  };
}

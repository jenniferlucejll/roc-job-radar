import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_ENV = {
  POSTGRES_PASSWORD: 'test-password',
  SCRAPE_CRON: '0 8 * * *',
  AI_ENABLED: 'true',
  OLLAMA_API_URL: 'http://ollama:11434/api/chat',
  OLLAMA_MODEL: 'gemma3',
  OLLAMA_READY_TIMEOUT_MS: '2000',
  OLLAMA_PULL_TIMEOUT_MS: '5000',
  OLLAMA_RETRY_INTERVAL_MS: '2500',
};

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  for (const key of [
    'POSTGRES_PASSWORD',
    'SCRAPE_CRON',
    'AI_ENABLED',
    'OLLAMA_API_URL',
    'OLLAMA_MODEL',
    'OLLAMA_READY_TIMEOUT_MS',
    'OLLAMA_PULL_TIMEOUT_MS',
    'OLLAMA_RETRY_INTERVAL_MS',
  ]) {
    delete process.env[key];
  }

  Object.assign(process.env, BASE_ENV);
});

afterEach(async () => {
  vi.useRealTimers();
  const mod = await import('../../src/startup/ensureOllama.js');
  mod.stopAiReadinessMonitorForTests();
});

async function loadEnsureOllamaModule() {
  return import('../../src/startup/ensureOllama.js');
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hangingResponseUntilAbort(): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]?.signal as AbortSignal | undefined;
    if (!signal) {
      reject(new Error('missing abort signal'));
      return;
    }

    signal.addEventListener('abort', () => {
      reject(new Error('This operation was aborted'));
    }, { once: true });
  });
}

describe('AI readiness monitor', () => {
  it('marks AI disabled and skips Ollama calls when AI is disabled', async () => {
    process.env.AI_ENABLED = 'false';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadEnsureOllamaModule();
    await mod.ensureOllamaReady();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.getAiRuntimeStatus()).toEqual(expect.objectContaining({
      enabled: false,
      state: 'disabled',
    }));
  });

  it('marks AI ready when the configured model is already present', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadEnsureOllamaModule();
    await mod.ensureOllamaReady();

    expect(mod.getAiRuntimeStatus()).toEqual(expect.objectContaining({
      enabled: true,
      state: 'ready',
      apiReachable: true,
      modelAvailable: true,
    }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama:11434/api/tags');
  });

  it('pulls the configured model when it is missing and ends ready', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [] }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }))
      .mockResolvedValueOnce(jsonResponse({ status: 'success' }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadEnsureOllamaModule();
    await mod.ensureOllamaReady();

    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://ollama:11434/api/pull');
    expect(mod.getAiRuntimeStatus()).toEqual(expect.objectContaining({
      state: 'ready',
      modelAvailable: true,
    }));
  });

  it('degrades AI status when Ollama is unreachable without throwing from the monitor', async () => {
    vi.useFakeTimers();
    process.env.OLLAMA_READY_TIMEOUT_MS = '1500';
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadEnsureOllamaModule();
    const promise = mod.runAiReadinessCheck();

    await vi.advanceTimersByTimeAsync(2_500);
    await promise;

    expect(mod.getAiRuntimeStatus()).toEqual(expect.objectContaining({
      state: 'degraded',
      apiReachable: false,
      lastError: expect.stringContaining('Timed out waiting for Ollama API'),
    }));
  });

  it('uses the pull timeout budget for /api/pull', async () => {
    vi.useFakeTimers();
    process.env.OLLAMA_READY_TIMEOUT_MS = '1000';
    process.env.OLLAMA_PULL_TIMEOUT_MS = '5000';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }))
      .mockImplementationOnce(() => hangingResponseUntilAbort());
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadEnsureOllamaModule();
    const promise = mod.ensureOllamaReady();

    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.resolve();

    let settled = false;
    promise.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(3_000);
    await expect(promise).rejects.toThrow('This operation was aborted');
  });

  it('retries in the background and transitions from degraded to ready', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadEnsureOllamaModule();
    mod.startAiReadinessMonitor();

    await vi.advanceTimersByTimeAsync(2_500);
    expect(mod.getAiRuntimeStatus()).toEqual(expect.objectContaining({
      state: 'degraded',
      apiReachable: false,
    }));

    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.resolve();

    expect(mod.getAiRuntimeStatus()).toEqual(expect.objectContaining({
      state: 'ready',
      apiReachable: true,
      modelAvailable: true,
    }));
  });

  it('continues scheduling readiness checks after AI becomes ready', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const mod = await loadEnsureOllamaModule();
    mod.startAiReadinessMonitor();

    await vi.advanceTimersByTimeAsync(1);

    expect(mod.getAiRuntimeStatus()).toEqual(expect.objectContaining({
      state: 'ready',
      apiReachable: true,
      modelAvailable: true,
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    expect(mod.getAiRuntimeStatus()).toEqual(expect.objectContaining({
      state: 'degraded',
      apiReachable: false,
      lastError: expect.stringContaining('Timed out waiting for Ollama API'),
    }));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE_ENV = {
  POSTGRES_PASSWORD: 'test-password',
  SCRAPE_CRON: '0 8 * * *',
  AI_ENABLED: 'true',
  OLLAMA_API_URL: 'http://ollama:11434/api/chat',
  OLLAMA_MODEL: 'gemma3',
  OLLAMA_READY_TIMEOUT_MS: '2000',
  OLLAMA_PULL_TIMEOUT_MS: '5000',
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
  ]) {
    delete process.env[key];
  }

  Object.assign(process.env, BASE_ENV);
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadEnsureOllama() {
  const mod = await import('../../src/startup/ensureOllama.js');
  return mod.ensureOllamaReady;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ensureOllamaReady', () => {
  it('skips all Ollama calls when AI is disabled', async () => {
    process.env.AI_ENABLED = 'false';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ensureOllamaReady = await loadEnsureOllama();
    await ensureOllamaReady();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('succeeds when the configured model is already present', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const ensureOllamaReady = await loadEnsureOllama();
    await ensureOllamaReady();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama:11434/api/tags');
  });

  it('pulls the configured model when it is missing', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [] }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }))
      .mockResolvedValueOnce(jsonResponse({ status: 'success' }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const ensureOllamaReady = await loadEnsureOllama();
    await ensureOllamaReady();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://ollama:11434/api/pull');
  });

  it('fails deterministically when the model pull fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [] }))
      .mockResolvedValueOnce(jsonResponse({ models: [] }))
      .mockResolvedValueOnce(new Response('missing', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const ensureOllamaReady = await loadEnsureOllama();

    await expect(ensureOllamaReady()).rejects.toThrow(
      'Ollama model pull failed with status 500: missing',
    );
  });

  it('times out with a clear error when the Ollama API never becomes reachable', async () => {
    vi.useFakeTimers();
    process.env.OLLAMA_READY_TIMEOUT_MS = '1500';
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const ensureOllamaReady = await loadEnsureOllama();
    const promise = ensureOllamaReady();
    const assertion = expect(promise).rejects.toThrow(
      'Timed out waiting for Ollama API at http://ollama:11434/api/tags: connect ECONNREFUSED',
    );

    await vi.advanceTimersByTimeAsync(2_000);

    await assertion;
  });

  it('retries model listing within the provisioning budget before succeeding', async () => {
    vi.useFakeTimers();
    process.env.OLLAMA_PULL_TIMEOUT_MS = '2500';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ models: [] }))
      .mockRejectedValueOnce(new Error('temporary timeout'))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: 'gemma3:latest' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const ensureOllamaReady = await loadEnsureOllama();
    const promise = ensureOllamaReady();

    await vi.advanceTimersByTimeAsync(2_000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

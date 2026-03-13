import { describe, it, expect, beforeEach, vi } from 'vitest';

// config.ts evaluates at import time, so we reset modules and re-import
// dynamically after setting env vars for each test.

const BASE_ENV = {
  POSTGRES_PASSWORD: 'test-password',
  SCRAPE_CRON: '0 8 * * *',
};

beforeEach(() => {
  vi.resetModules();
  // Clear all relevant env vars before each test
  for (const key of [
    'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD',
    'PORT', 'SERVER_HOST', 'NODE_ENV', 'SCRAPE_CRON', 'SCRAPE_TIMEOUT_MS', 'SCRAPE_MAX_RETRY_ATTEMPTS', 'SCRAPE_RETRY_BASE_DELAY_MS', 'SCRAPE_REQUEST_INTERVAL_MS', 'SCRAPE_DETAIL_INTERVAL_MS', 'USER_AGENT',
    'AI_ENABLED', 'OLLAMA_API_URL', 'OLLAMA_MODEL', 'OLLAMA_READY_TIMEOUT_MS', 'OLLAMA_PULL_TIMEOUT_MS', 'AI_REQ_TIMEOUT_MS',
    'AI_MAX_CHARS', 'AI_REQUEST_MAX_TOKENS', 'AI_MAX_PARALLELISM', 'AI_MAX_RETRIES', 'AI_RETRY_BASE_DELAY_MS',
  ]) {
    delete process.env[key];
  }
});

async function loadConfig() {
  const mod = await import('../src/config.js');
  return mod.config;
}

describe('config', () => {
  it('throws when POSTGRES_PASSWORD is missing', async () => {
    await expect(loadConfig()).rejects.toThrow('Missing required environment variable: POSTGRES_PASSWORD');
  });

  it('throws when SCRAPE_CRON is missing', async () => {
    Object.assign(process.env, { POSTGRES_PASSWORD: BASE_ENV.POSTGRES_PASSWORD });
    delete process.env.SCRAPE_CRON;
    await expect(loadConfig()).rejects.toThrow('Missing required environment variable: SCRAPE_CRON');
  });

  it('returns defaults when only required vars are set', async () => {
    Object.assign(process.env, BASE_ENV);
    const config = await loadConfig();

    expect(config.db.host).toBe('localhost');
    expect(config.db.port).toBe(5432);
    expect(config.db.name).toBe('roc_job_radar');
    expect(config.db.user).toBe('rjr');
    expect(config.db.password).toBe('test-password');
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.server.port).toBe(3000);
    expect(config.server.nodeEnv).toBe('development');
    expect(config.scraper.cron).toBe('0 8 * * *');
    expect(config.scraper.timeoutMs).toBe(30_000);
    expect(config.scraper.maxRetryAttempts).toBe(3);
    expect(config.scraper.retryBaseDelayMs).toBe(1_000);
    expect(config.scraper.requestIntervalMs).toBe(1_000);
    expect(config.scraper.detailIntervalMs).toBe(3_000);
    expect(config.scraper.userAgent).toBe('roc-job-radar/1.0 (personal job monitoring tool)');
    expect(config.scraper.ai.enabled).toBe(false);
    expect(config.scraper.ai.model).toBe('gemma3');
    expect(config.scraper.ai.readyTimeoutMs).toBe(60_000);
    expect(config.scraper.ai.pullTimeoutMs).toBe(600_000);
  });

  it('reads overridden values from env', async () => {
    Object.assign(process.env, {
      ...BASE_ENV,
      POSTGRES_HOST: 'db-host',
      POSTGRES_PORT: '5433',
      SERVER_HOST: '0.0.0.0',
      PORT: '4000',
      SCRAPE_TIMEOUT_MS: '15000',
      SCRAPE_MAX_RETRY_ATTEMPTS: '5',
      SCRAPE_RETRY_BASE_DELAY_MS: '250',
      SCRAPE_REQUEST_INTERVAL_MS: '2500',
      USER_AGENT: 'custom-agent',
      AI_ENABLED: 'true',
      OLLAMA_API_URL: 'http://ollama:11434/api/chat',
      OLLAMA_MODEL: 'llama3.2',
      OLLAMA_READY_TIMEOUT_MS: '123000',
      OLLAMA_PULL_TIMEOUT_MS: '456000',
      AI_MAX_PARALLELISM: '1',
    });
    const config = await loadConfig();

    expect(config.db.host).toBe('db-host');
    expect(config.db.port).toBe(5433);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.port).toBe(4000);
    expect(config.scraper.timeoutMs).toBe(15_000);
    expect(config.scraper.maxRetryAttempts).toBe(5);
    expect(config.scraper.retryBaseDelayMs).toBe(250);
    expect(config.scraper.requestIntervalMs).toBe(2_500);
    expect(config.scraper.userAgent).toBe('custom-agent');
    expect(config.scraper.ai.enabled).toBe(true);
    expect(config.scraper.ai.apiUrl).toBe('http://ollama:11434/api/chat');
    expect(config.scraper.ai.model).toBe('llama3.2');
    expect(config.scraper.ai.readyTimeoutMs).toBe(123_000);
    expect(config.scraper.ai.pullTimeoutMs).toBe(456_000);
    expect(config.scraper.ai.maxParallelism).toBe(1);
  });

  it('throws when an integer env var is not a number', async () => {
    Object.assign(process.env, { ...BASE_ENV, PORT: 'not-a-number' });
    await expect(loadConfig()).rejects.toThrow('Environment variable PORT must be an integer');
  });
});

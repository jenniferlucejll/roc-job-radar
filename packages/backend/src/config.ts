function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

function optionalBoolean(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return defaultValue;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export const config = Object.freeze({
  db: {
    host: optional('POSTGRES_HOST', 'localhost'),
    port: optionalInt('POSTGRES_PORT', 5432),
    name: optional('POSTGRES_DB', 'roc_job_radar'),
    user: optional('POSTGRES_USER', 'rjr'),
    password: required('POSTGRES_PASSWORD'),
  },
  server: {
    host: optional('SERVER_HOST', '127.0.0.1'),
    port: optionalInt('PORT', 3000),
    nodeEnv: optional('NODE_ENV', 'development'),
  },
  scraper: {
    cron: required('SCRAPE_CRON'),
    timeoutMs: optionalInt('SCRAPE_TIMEOUT_MS', 30_000),
    maxRetryAttempts: optionalInt('SCRAPE_MAX_RETRY_ATTEMPTS', 3),
    retryBaseDelayMs: optionalInt('SCRAPE_RETRY_BASE_DELAY_MS', 1000),
    requestIntervalMs: optionalInt('SCRAPE_REQUEST_INTERVAL_MS', 1_000),
    detailIntervalMs: optionalInt('SCRAPE_DETAIL_INTERVAL_MS', 3_000),
    userAgent: optional('USER_AGENT', 'roc-job-radar/1.0 (personal job monitoring tool)'),
    ai: {
      enabled: optionalBoolean('AI_ENABLED', false),
      apiUrl: optional('OLLAMA_API_URL', 'http://127.0.0.1:11434/api/chat'),
      model: optional('OLLAMA_MODEL', 'gemma3'),
      readyTimeoutMs: optionalInt('OLLAMA_READY_TIMEOUT_MS', 60_000),
      pullTimeoutMs: optionalInt('OLLAMA_PULL_TIMEOUT_MS', 10 * 60_000),
      timeoutMs: optionalInt('AI_REQ_TIMEOUT_MS', 60_000),
      maxInputChars: optionalInt('AI_MAX_CHARS', 12_000),
      requestMaxTokens: optionalInt('AI_REQUEST_MAX_TOKENS', 768),
      maxParallelism: optionalInt('AI_MAX_PARALLELISM', 3),
      maxRetries: optionalInt('AI_MAX_RETRIES', 1),
      retryBaseDelayMs: optionalInt('AI_RETRY_BASE_DELAY_MS', 500),
    },
  },
});

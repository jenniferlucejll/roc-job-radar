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

export const config = Object.freeze({
  db: {
    host: optional('POSTGRES_HOST', 'localhost'),
    port: optionalInt('POSTGRES_PORT', 5432),
    name: optional('POSTGRES_DB', 'roc_job_radar'),
    user: optional('POSTGRES_USER', 'rjr'),
    password: required('POSTGRES_PASSWORD'),
  },
  server: {
    port: optionalInt('PORT', 3000),
    nodeEnv: optional('NODE_ENV', 'development'),
  },
  scraper: {
    cron: optional('SCRAPE_CRON', '0 */6 * * *'),
    timeoutMs: optionalInt('SCRAPE_TIMEOUT_MS', 30_000),
    userAgent: optional('USER_AGENT', 'roc-job-radar/1.0 (personal job monitoring tool)'),
  },
});

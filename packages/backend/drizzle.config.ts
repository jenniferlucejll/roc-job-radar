import { defineConfig } from 'drizzle-kit';

// Use direct env reads here — db:generate doesn't need a live connection,
// so we avoid importing config.ts (which throws on missing POSTGRES_PASSWORD).
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: Number(process.env['POSTGRES_PORT'] ?? 5432),
    database: process.env['POSTGRES_DB'] ?? 'roc_job_radar',
    user: process.env['POSTGRES_USER'] ?? 'rjr',
    password: process.env['POSTGRES_PASSWORD'] ?? '',
  },
});

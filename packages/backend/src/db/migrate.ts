import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

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
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return parsed;
}

const sql = postgres({
  host: optional('POSTGRES_HOST', 'localhost'),
  port: optionalInt('POSTGRES_PORT', 5432),
  database: optional('POSTGRES_DB', 'roc_job_radar'),
  username: optional('POSTGRES_USER', 'rjr'),
  password: required('POSTGRES_PASSWORD'),
  max: 1,
});

const db = drizzle(sql);

await migrate(db, { migrationsFolder: './src/db/migrations' });
console.log('Migrations applied.');
await sql.end();

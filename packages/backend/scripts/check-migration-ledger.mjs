import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

function optional(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}

function optionalInt(name, defaultValue) {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return parsed;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function warn(message) {
  console.warn(message);
}

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
if (!Array.isArray(journal.entries)) {
  fail('Migration drift detected: _journal.json missing or invalid entries array');
}

const journalEntries = journal.entries;

const journalFiles = journalEntries
  .map((entry) => `${entry.tag}.sql`)
  .filter((file) => migrationFiles.includes(file))
  .sort();

const orphanedFiles = migrationFiles.filter((file) => !journalFiles.includes(file));
const missingFiles = journal.entries
  .map((entry) => `${entry.tag}.sql`)
  .filter((file) => !migrationFiles.includes(file));

if (orphanedFiles.length > 0) {
  fail('Migration drift detected: SQL files not present in _journal.json');
  for (const file of orphanedFiles) {
    console.error(`  - ${file}`);
  }
}

if (missingFiles.length > 0) {
  fail('Migration drift detected: _journal.json references missing SQL files');
  for (const file of missingFiles) {
    console.error(`  - ${file}`);
  }
}

const journalByEntryOrder = journalEntries.map((entry) => ({ tag: entry.tag, when: Number(entry.when) }));
const orderedByJournalWhen = [...journalEntries]
  .map((entry) => ({ tag: entry.tag, when: Number(entry.when) }))
  .sort((a, b) => a.when - b.when);

for (let i = 1; i < journalByEntryOrder.length; i += 1) {
  const prev = journalByEntryOrder[i - 1];
  const current = journalByEntryOrder[i];
  if (!Number.isFinite(prev.when) || !Number.isFinite(current.when)) {
    fail('Migration drift detected: journal.when contains invalid non-numeric value');
    break;
  }
  if (current.when <= prev.when) {
    fail('Migration drift detected: _journal.json has non-increasing migration when timestamps');
    console.error(`  - ordering issue at ${prev.tag}.sql (${prev.when}) -> ${current.tag}.sql (${current.when})`);
    break;
  }
}

const hasMigrationDbHints =
  process.env.POSTGRES_HOST ||
  process.env.POSTGRES_PORT ||
  process.env.POSTGRES_USER ||
  process.env.POSTGRES_DB ||
  process.env.POSTGRES_PASSWORD ||
  process.env.POSTGRES_URL;

if (hasMigrationDbHints) {
  try {
    const sql = postgres({
      host: optional('POSTGRES_HOST', 'localhost'),
      port: optionalInt('POSTGRES_PORT', 5432),
      username: optional('POSTGRES_USER', 'rjr'),
      password: optional('POSTGRES_PASSWORD', 'changeme'),
      database: optional('POSTGRES_DB', 'roc_job_radar'),
      max: 1,
    });

    const rows = await sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    if (rows.length === 0) {
      fail('Migration drift detected: drizzle.__drizzle_migrations table is empty');
    } else if (rows.length < journalEntries.length) {
      fail(
        `Migration drift detected: ledger missing entries (${rows.length} applied, ${journalEntries.length} expected).`
        + ' Run db:migrate in a clean environment to realign.',
      );
    }
    await sql.end();
  } catch (error) {
    warn(`Migration DB check skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  warn('Migration DB check skipped: no Postgres environment variables found.');
}

if (orphanedFiles.length > 0 || missingFiles.length > 0) {
  process.exit(1);
}

if (failed) {
  process.exit(1);
}

console.log('Migration ledger and migration files are synchronized.');

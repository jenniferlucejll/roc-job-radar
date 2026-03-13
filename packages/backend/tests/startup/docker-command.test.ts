import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production docker backend command', () => {
  it('ensures Ollama readiness before migrations and server startup', async () => {
    const root = resolve(import.meta.dirname, '../../../..');
    const compose = await readFile(resolve(root, 'docker-compose.prod.yml'), 'utf8');

    const ensureIndex = compose.indexOf('node dist/startup/ensureOllama.js');
    const migrateIndex = compose.indexOf('npx tsx src/db/migrate.ts');
    const startIndex = compose.indexOf('node dist/index.js');

    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(migrateIndex).toBeGreaterThan(ensureIndex);
    expect(startIndex).toBeGreaterThan(migrateIndex);
  });
});

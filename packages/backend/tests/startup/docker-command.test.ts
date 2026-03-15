import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('docker backend startup commands', () => {
  it('runs base compose migrations before starting the backend server', async () => {
    const root = resolve(import.meta.dirname, '../../../..');
    const compose = await readFile(resolve(root, 'docker-compose.yml'), 'utf8');

    const migrateIndex = compose.indexOf('npm run db:migrate');
    const startIndex = compose.indexOf('npm run start');

    expect(migrateIndex).toBeGreaterThanOrEqual(0);
    expect(startIndex).toBeGreaterThan(migrateIndex);
    expect(compose).not.toContain('node dist/startup/ensureOllama.js');
  });

  it('runs dev compose migrations before starting watch mode without Ollama gating', async () => {
    const root = resolve(import.meta.dirname, '../../../..');
    const compose = await readFile(resolve(root, 'docker-compose.override.yml'), 'utf8');

    const migrateIndex = compose.indexOf('npm run db:migrate');
    const startIndex = compose.indexOf('npx tsx watch src/index.ts');

    expect(migrateIndex).toBeGreaterThanOrEqual(0);
    expect(startIndex).toBeGreaterThan(migrateIndex);
    expect(compose).toContain('npx tsx watch src/index.ts');
    expect(compose).not.toContain('src/startup/ensureOllama.ts');
  });

  it('runs production migrations then starts the server without Ollama gating', async () => {
    const root = resolve(import.meta.dirname, '../../../..');
    const compose = await readFile(resolve(root, 'docker-compose.prod.yml'), 'utf8');

    const migrateIndex = compose.indexOf('npm run db:migrate');
    const startIndex = compose.indexOf('node dist/index.js');

    expect(compose).not.toContain('node dist/startup/ensureOllama.js');
    expect(migrateIndex).toBeGreaterThanOrEqual(0);
    expect(startIndex).toBeGreaterThan(migrateIndex);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { migrationSql } from '../test/db-from-migrations.js';

const script = join(import.meta.dirname, 'copy-legacy-shares.mjs');
let dir: string; let dbUrl: string; let json: string;

const neon = [
  { id: 1, external_id: 'Ab3dEf6hIj9kLm2n', activities: { 0: [{ id: 1, value: 8, label: 'sleep' }] }, chart_types: { 0: 'pie' }, time_unit: 'day', month: null, year: null, created: '2018-06-30T14:05:09.123456' },
  { id: 2, external_id: 'short1', activities: JSON.stringify({ 0: [] }), chart_types: JSON.stringify({ 0: 'bar' }), time_unit: 'month', month: 'May', year: 2019, created: null },
];

function run() {
  // Env points ONLY at the temp file DB: nothing inherited, so no prod URL can leak in.
  const r = spawnSync(process.execPath, ['--experimental-strip-types', script, json], {
    env: { PATH: process.env.PATH ?? '', TURSO_DATABASE_URL: dbUrl },
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pause-legacy-'));
  dbUrl = `file:${join(dir, 'test.db')}`;
  json = join(dir, 'neon.json');
  writeFileSync(json, JSON.stringify(neon));
  const c = createClient({ url: dbUrl });
  for (const s of migrationSql()) await c.execute(s);
  c.close();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('copy-legacy-shares.mjs', () => {
  it('copies, is idempotent, and the verifier fails when a row is missing', async () => {
    const first = run();
    expect(first.status, first.out).toBe(0);
    expect(first.out).toContain(`target: ${dbUrl}`);
    expect(first.out).toContain('inserted this run: 2');

    const second = run();
    expect(second.status, second.out).toBe(0);
    expect(second.out).toContain('inserted this run: 0');

    const c = createClient({ url: dbUrl });
    await c.execute(`DELETE FROM plans WHERE share_id = 'short1'`);
    c.close();
    // Re-running would re-copy the row, so verify with the copy disabled.
    const dry = spawnSync(process.execPath, ['--experimental-strip-types', script, json, '--dry-run'], {
      env: { PATH: process.env.PATH ?? '', TURSO_DATABASE_URL: dbUrl }, encoding: 'utf8',
    });
    expect(dry.status).toBe(1);
    expect(`${dry.stdout}${dry.stderr}`).toContain('MISMATCH');
  });
});

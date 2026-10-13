#!/usr/bin/env node
// Copy pause_api's Neon `activities` rows into Turso `plans`, keeping each
// external_id as share_id so every old share link keeps resolving.
// Idempotent: ON CONFLICT(share_id) DO NOTHING. Verifies count AND id-set
// equality afterwards and exits 1 on any difference.
//
// Input is a JSON array exported from Neon (never connect from here):
//   psql "$LEGACY_DATABASE_URL" -At -c \
//     "select coalesce(json_agg(row_to_json(a)), '[]') from activities a" > "$SCRATCH/neon-activities.json"
//
// Usage: node --experimental-strip-types scripts/copy-legacy-shares.mjs "$SCRATCH/neon-activities.json" [--dry-run]
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { diffShareIds, legacyRowToPlan } from '../lib/legacy-row.ts';

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('usage: copy-legacy-shares.mjs <neon-json> [--dry-run]'); process.exit(2); }
const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
// A prod command must echo its target (memory: prod-db-command-must-echo-its-target).
console.log(`target: ${url}${flag === '--dry-run' ? ' (dry run)' : ''}`);
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

const neon = JSON.parse(readFileSync(file, 'utf8'));
const now = Date.now();
let inserted = 0;
if (flag !== '--dry-run') {
  for (const row of neon) {
    const p = legacyRowToPlan(row, now);
    const r = await client.execute({
      sql: `INSERT INTO plans (id, share_id, owner_email, name, name_key, activities, chart_types, time_unit, month, year, source, created_at, updated_at)
            VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, 'legacy', ?, ?) ON CONFLICT(share_id) DO NOTHING`,
      args: [p.id, p.shareId, JSON.stringify(p.activities), JSON.stringify(p.chartTypes), p.timeUnit, p.month ?? null, p.year ?? null, p.createdAt, p.updatedAt],
    });
    inserted += r.rowsAffected;
  }
}
const t = await client.execute(`SELECT share_id FROM plans WHERE source = 'legacy'`);
const tursoIds = t.rows.map((r) => String(r.share_id));
const { missing, extra } = diffShareIds(neon.map((r) => r.external_id), tursoIds);
console.log(`neon rows: ${neon.length}  turso legacy rows: ${tursoIds.length}  inserted this run: ${inserted}`);
if (missing.length || extra.length || neon.length !== tursoIds.length) {
  console.error(`MISMATCH missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);
  process.exit(1);
}
console.log('verified: every external_id is present exactly once');

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { callHandler } from '../test/http.js';
import { plans } from '../db/schema.js';
import { legacyRowToPlan } from './legacy-row.js';

const h = vi.hoisted(() => ({ db: null as never }));
vi.mock('../db/index.js', () => ({ get db() { return h.db; } }));
const handler = (await import('../api/pause/activities.js')).default;
const db = () => h.db as Awaited<ReturnType<typeof makeMigratedDb>>;

beforeEach(async () => { h.db = (await makeMigratedDb()) as never; });

const acts = { 0: [{ id: 1, value: 8, label: 'sleep' }] };

describe('legacy rows with string-encoded JSON, end to end', () => {
  it('maps, inserts, stores decoded, and GET returns objects (single and double encoded)', async () => {
    const rows = [
      { id: 1, external_id: 'Ab3dEf6hIj9kLm2n', activities: JSON.stringify(acts), chart_types: JSON.stringify({ 0: 'pie' }) },
      { id: 2, external_id: 'dbl-encoded', activities: JSON.stringify(JSON.stringify(acts)), chart_types: JSON.stringify(JSON.stringify({ 0: 'bar' })) },
    ].map((r) => ({ ...r, time_unit: 'day', month: null, year: null, created: '2018-06-30T14:05:09' }));
    for (const r of rows) await db().insert(plans).values(legacyRowToPlan(r, 1));

    for (const [i, r] of rows.entries()) {
      const stored = (await db().select().from(plans).where(eq(plans.shareId, r.external_id)))[0];
      expect(typeof stored.activities).toBe('object');
      expect(typeof stored.chartTypes).toBe('object');
      const out = await callHandler(handler, { method: 'GET', query: { id: r.external_id } });
      expect(out.status).toBe(200);
      expect(out.body).toEqual({ activities: acts, chart_types: { 0: i === 0 ? 'pie' : 'bar' }, time_unit: 'day', month: null, year: null, name: null });
    }
  });
  it('an external_id that is not 16 characters still resolves through GET', async () => {
    await db().insert(plans).values(legacyRowToPlan({ id: 9, external_id: 'abc123', activities: acts, chart_types: { 0: 'pie' }, time_unit: 'day', month: null, year: null, created: null }, 5));
    expect((await callHandler(handler, { method: 'GET', query: { id: 'abc123' } })).status).toBe(200);
  });
});

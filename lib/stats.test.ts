import { describe, it, expect, beforeEach } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { plans } from '../db/schema.js';
import { getPauseStats, isValidTimeZone, monthKey } from './stats.js';

let db: Awaited<ReturnType<typeof makeMigratedDb>>;
let n = 0;
beforeEach(async () => { db = await makeMigratedDb(); n = 0; });

type Row = { id: number | string; value: number | string; label: string };
async function add(owner: string | null, createdAt: number, days: Row[][]) {
  n += 1;
  await db.insert(plans).values({
    id: `p${n}`, shareId: `S${String(n).padStart(15, '0')}`, ownerEmail: owner,
    name: owner ? `plan ${n}` : null, nameKey: owner ? `plan ${n}` : null,
    activities: Object.fromEntries(days.map((d, i) => [i, d])), chartTypes: {}, timeUnit: 'day',
    createdAt, updatedAt: createdAt,
  });
}
const A = 'a@example.com';
const OCT_15 = Date.UTC(2026, 9, 15, 12);
const clock = { now: OCT_15, timeZone: 'UTC' };

describe('getPauseStats', () => {
  it('no saved plans → { empty: true } (absent, not zero)', async () => {
    await add(null, OCT_15, [[{ id: 1, value: 8, label: 'sleep' }]]); // anonymous never counts
    expect(await getPauseStats(db, A, clock)).toEqual({ empty: true });
  });

  it("counts only this person's plans", async () => {
    await add(A, OCT_15, [[{ id: 1, value: 8, label: 'sleep' }]]);
    await add('b@example.com', OCT_15, [[{ id: 1, value: 99, label: 'sleep' }, { id: 2, value: 1, label: 'secret' }]]);
    const s = await getPauseStats(db, A, clock);
    if (s.empty) throw new Error();
    expect(s.planCount).toBe(1);
    expect(s.hours).toEqual([{ label: 'sleep', hours: 8 }]);
  });

  it('sums hours across days and plans, case-insensitively, keeping the first-seen label', async () => {
    await add(A, OCT_15, [[{ id: 1, value: 8, label: 'Sleep' }, { id: 2, value: '1.5', label: 'walk' }], [{ id: 1, value: 7, label: 'sleep ' }]]);
    await add(A, OCT_15, [[{ id: 0, value: 20, label: '' }, { id: '?', value: 4, label: 'typing' }, { id: 1, value: 9, label: 'SLEEP' }, { id: 3, value: 'abc', label: 'bad' }]]);
    const s = await getPauseStats(db, A, clock);
    if (s.empty) throw new Error();
    expect(s.hours).toEqual([{ label: 'Sleep', hours: 24 }, { label: 'walk', hours: 1.5 }]);
  });

  it('counts plans with no activities separately', async () => {
    await add(A, OCT_15, [[{ id: 0, value: 24, label: '' }, { id: '?', value: '', label: '' }]]);
    await add(A, OCT_15, [[{ id: 1, value: 2, label: 'read' }]]);
    const s = await getPauseStats(db, A, clock);
    if (s.empty) throw new Error();
    expect(s.plansWithoutActivities).toBe(1);
  });

  it('buckets months by the viewer\'s local date: 03:00Z on Oct 1 is September in New York', async () => {
    await add(A, Date.UTC(2026, 9, 1, 3), [[{ id: 1, value: 1, label: 'x' }]]);
    const ny = await getPauseStats(db, A, { now: OCT_15, timeZone: 'America/New_York' });
    const utc = await getPauseStats(db, A, clock);
    if (ny.empty || utc.empty) throw new Error();
    expect(ny.months.find((m) => m.count === 1)?.key).toBe('2026-09');
    expect(utc.months.find((m) => m.count === 1)?.key).toBe('2026-10');
  });

  it('11:30 pm on Oct 31 in Los Angeles counts in October', async () => {
    await add(A, Date.UTC(2026, 10, 1, 6, 30), [[{ id: 1, value: 1, label: 'x' }]]);
    const s = await getPauseStats(db, A, { now: Date.UTC(2026, 10, 2), timeZone: 'America/Los_Angeles' });
    if (s.empty) throw new Error();
    expect(s.months.map((m) => [m.key, m.count])).toEqual([['2026-10', 1], ['2026-11', 0]]);
  });

  it('months run from the first plan to now with true zeros, capped at the last 12', async () => {
    await add(A, Date.UTC(2025, 0, 10), [[{ id: 1, value: 1, label: 'x' }]]);
    await add(A, Date.UTC(2026, 7, 10), [[{ id: 1, value: 1, label: 'x' }]]);
    const s = await getPauseStats(db, A, clock);
    if (s.empty) throw new Error();
    expect(s.months).toHaveLength(12);
    expect(s.months[0]).toEqual({ key: '2025-11', label: 'Nov 2025', count: 0 });
    expect(s.months.at(-1)).toEqual({ key: '2026-10', label: 'Oct 2026', count: 0 });
    expect(s.months.find((m) => m.key === '2026-08')?.count).toBe(1);
  });

  it('most planned: most plans, then most hours, then alphabetical', async () => {
    await add(A, OCT_15, [[{ id: 1, value: 1, label: 'read' }, { id: 2, value: 5, label: 'walk' }]]);
    await add(A, OCT_15, [[{ id: 1, value: 1, label: 'read' }, { id: 2, value: 1, label: 'walk' }]]);
    await add(A, OCT_15, [[{ id: 1, value: 3, label: 'zen' }]]);
    const s = await getPauseStats(db, A, clock);
    if (s.empty) throw new Error();
    expect(s.mostPlanned).toEqual({ label: 'walk', plans: 2 });
  });

  it('mostPlanned is null when no plan has an activity', async () => {
    await add(A, OCT_15, [[{ id: 0, value: 24, label: '' }]]);
    const s = await getPauseStats(db, A, clock);
    if (s.empty) throw new Error();
    expect(s.mostPlanned).toBeNull();
    expect(s.hours).toEqual([]);
  });
});

describe('time zone helpers', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
  it('monthKey', () => expect(monthKey(Date.UTC(2026, 0, 1, 2), 'America/Chicago')).toBe('2025-12'));
});

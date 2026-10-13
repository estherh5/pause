import { describe, it, expect, beforeEach } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { plans } from '../db/schema.js';
import {
  ANON_CREATE_LIMIT, ANON_CREATE_WINDOW_MS, PLAN_LIMIT, countActivities, createAnonymousPlan, createPlan,
  deletePlan, getPlan, listPlans, readShare, updatePlan,
} from './plans.js';
import type { PlanPayload } from './types.js';

let db: Awaited<ReturnType<typeof makeMigratedDb>>;
beforeEach(async () => { db = await makeMigratedDb(); });

const day = (rows: { id: number | string; value: number | string; label: string }[]): PlanPayload => ({
  activities: { 0: rows }, chartTypes: { 0: 'pie' }, timeUnit: 'day', month: null, year: null,
});
const P = day([{ id: 0, value: 16, label: '' }, { id: 1, value: 8, label: 'sleep' }, { id: '?', value: '', label: '' }]);
const A = 'a@example.com';
const B = 'b@example.com';
const nm = (name: string) => ({ name, key: name.toLowerCase() });

describe('anonymous shares', () => {
  it('round-trips: what is created is what a share link reads, with no owner data', async () => {
    const out = await createAnonymousPlan(db, P, 1000);
    if (!('shareId' in out)) throw new Error('expected shareId');
    const view = await readShare(db, out.shareId);
    expect(view).toEqual({ activities: P.activities, chart_types: P.chartTypes, time_unit: 'day', month: null, year: null, name: null });
    expect(Object.keys(view!).sort()).toEqual(['activities', 'chart_types', 'month', 'name', 'time_unit', 'year']);
    expect(JSON.stringify(view)).not.toMatch(/@/);
  });
  it(`allows ${ANON_CREATE_LIMIT} anonymous creates per rolling hour, then rate-limits`, async () => {
    for (let i = 0; i < ANON_CREATE_LIMIT; i++) expect(await createAnonymousPlan(db, P, 1000 + i)).toHaveProperty('shareId');
    expect(await createAnonymousPlan(db, P, 2000)).toEqual({ error: 'rate-limited' });
    expect(await createAnonymousPlan(db, P, 1000 + ANON_CREATE_WINDOW_MS + 20)).toHaveProperty('shareId');
  });
  it('saved plans do not count toward the anonymous limit', async () => {
    for (let i = 0; i < ANON_CREATE_LIMIT; i++) await createPlan(db, A, nm(`p${i}`), P, 1000);
    expect(await createAnonymousPlan(db, P, 1001)).toHaveProperty('shareId');
  });
  it('unknown share id → null', async () => {
    expect(await readShare(db, 'nope')).toBeNull();
  });
});

describe('saved plans are scoped to their owner', () => {
  it("B never lists, reads, renames, replaces or deletes A's plan", async () => {
    const a = await createPlan(db, A, nm('Week'), P, 1);
    if ('error' in a) throw new Error();
    expect(await listPlans(db, B)).toEqual([]);
    expect(await getPlan(db, B, a.id)).toBeNull();
    expect(await updatePlan(db, B, a.id, { name: nm('Mine now') }, 2)).toBeNull();
    expect(await updatePlan(db, B, a.id, { payload: day([]) }, 2)).toBeNull();
    expect(await deletePlan(db, B, a.id)).toBe(false);
    expect((await getPlan(db, A, a.id))?.name).toBe('Week');
  });
  it('owner email compares case-insensitively', async () => {
    await createPlan(db, 'A@Example.com', nm('Week'), P, 1);
    expect(await listPlans(db, A)).toHaveLength(1);
  });
  it('lists newest-updated first with activity counts', async () => {
    await createPlan(db, A, nm('Old'), P, 1);
    const n = await createPlan(db, A, nm('New'), day([{ id: 1, value: 2, label: 'Read' }, { id: 2, value: 1, label: 'read ' }, { id: 3, value: 1, label: 'walk' }]), 5);
    const list = await listPlans(db, A);
    expect(list.map((p) => p.name)).toEqual(['New', 'Old']);
    expect(list[0]).toMatchObject({ activityCount: 2, shareId: (n as { shareId: string }).shareId });
    expect(list[1].activityCount).toBe(1);
  });
});

describe('names', () => {
  it('rejects a duplicate name for the same person, but not for another person', async () => {
    await createPlan(db, A, nm('Week'), P, 1);
    expect(await createPlan(db, A, { name: 'WEEK', key: 'week' }, P, 2)).toEqual({ error: 'duplicate-name' });
    expect(await createPlan(db, B, nm('Week'), P, 2)).not.toHaveProperty('error');
  });
  it('two concurrent saves of one name make exactly one row', async () => {
    const results = await Promise.all([createPlan(db, A, nm('Week'), P, 1), createPlan(db, A, nm('Week'), P, 1)]);
    expect(results.filter((r) => 'error' in r)).toEqual([{ error: 'duplicate-name' }]);
    expect(await db.select().from(plans)).toHaveLength(1);
  });
  it('renaming a plan to its own name (even recased) is allowed; to another plan\'s name is not', async () => {
    const w = await createPlan(db, A, nm('Week'), P, 1) as { id: string };
    await createPlan(db, A, nm('Month'), P, 1);
    expect(await updatePlan(db, A, w.id, { name: { name: 'WEEK', key: 'week' } }, 2)).toMatchObject({ name: 'WEEK' });
    expect(await updatePlan(db, A, w.id, { name: nm('Month') }, 3)).toEqual({ error: 'duplicate-name' });
  });
  it(`stops at ${PLAN_LIMIT} plans per person`, async () => {
    await db.insert(plans).values(Array.from({ length: PLAN_LIMIT }, (_, i) => ({
      id: `x${i}`, shareId: `S${String(i).padStart(15, '0')}`, ownerEmail: A, name: `n${i}`, nameKey: `n${i}`,
      activities: {}, chartTypes: {}, timeUnit: 'day', createdAt: 1, updatedAt: 1,
    })));
    expect(await createPlan(db, A, nm('one more'), P, 2)).toEqual({ error: 'plan-limit' });
  });
});

describe('share links of saved plans are live', () => {
  it('show the current name and content, and die with the plan', async () => {
    const p = await createPlan(db, A, nm('Week'), P, 1) as { id: string; shareId: string };
    await updatePlan(db, A, p.id, { name: nm('Better week'), payload: day([{ id: 1, value: 3, label: 'run' }]) }, 2);
    expect(await readShare(db, p.shareId)).toMatchObject({ name: 'Better week', activities: { 0: [{ id: 1, value: 3, label: 'run' }] } });
    expect(await deletePlan(db, A, p.id)).toBe(true);
    expect(await readShare(db, p.shareId)).toBeNull();
  });
});

describe('countActivities', () => {
  it('ignores the unplanned and entry rows and blank labels, and dedupes by label across days', () => {
    expect(countActivities({
      0: [{ id: 0, value: 10, label: '' }, { id: 1, value: 8, label: 'Sleep' }, { id: '?', value: '', label: 'typing' }],
      1: [{ id: 1, value: 8, label: 'sleep' }, { id: 2, value: 1, label: '  ' }],
    })).toBe(1);
  });
});

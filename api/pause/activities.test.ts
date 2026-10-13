import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../../test/db-from-migrations.js';
import { callHandler } from '../../test/http.js';
import { plans } from '../../db/schema.js';
import { createPlan, updatePlan } from '../../lib/plans.js';
import { sql } from 'drizzle-orm';

const h = vi.hoisted(() => ({ db: null as never }));
vi.mock('../../db/index.js', () => ({ get db() { return h.db; } }));
const handler = (await import('./activities.js')).default;
const db = () => h.db as Awaited<ReturnType<typeof makeMigratedDb>>;

beforeEach(async () => { h.db = (await makeMigratedDb()) as never; });

const body = {
  activities: { 0: [{ id: 0, value: 16, label: '' }, { id: 1, value: 8, label: 'sleep', color: '#ff0000' }] },
  chartTypes: { 0: 'bar' }, timeUnit: 'month', month: 'October', year: 2026,
};

describe('anonymous share round-trip (wire format of pause_api)', () => {
  it('POST → 201 + JSON string id; GET → the same plan in snake_case, name null', async () => {
    const created = await callHandler(handler, { method: 'POST', body });
    expect(created.status).toBe(201);
    expect(typeof created.body).toBe('string');
    const read = await callHandler(handler, { method: 'GET', query: { id: created.body as string } });
    expect(read.status).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(read.body).toEqual({ activities: body.activities, chart_types: { 0: 'bar' }, time_unit: 'month', month: 'October', year: 2026, name: null });
  });
  it('400 with pause_api\'s message on a bad payload', async () => {
    const out = await callHandler(handler, { method: 'POST', body: { activities: {} } });
    expect(out).toMatchObject({ status: 400, body: 'Request must contain activities and time unit' });
  });
  it('413 over 64 KB', async () => {
    const out = await callHandler(handler, { method: 'POST', body, headers: { 'content-length': String(70_000) } });
    expect(out.status).toBe(413);
  });
  it('429 after ten anonymous creates in an hour', async () => {
    for (let i = 0; i < 10; i++) await callHandler(handler, { method: 'POST', body });
    expect((await callHandler(handler, { method: 'POST', body })).status).toBe(429);
  });
  it('404 "Activities not found" for an unknown or absurdly long id', async () => {
    expect(await callHandler(handler, { method: 'GET', query: { id: 'missingmissing00' } })).toMatchObject({ status: 404, body: 'Activities not found' });
    expect((await callHandler(handler, { method: 'GET', query: { id: 'x'.repeat(65) } })).status).toBe(404);
  });
});

describe('legacy and saved-plan share ids resolve through the same GET', () => {
  it('a legacy external_id of any length resolves', async () => {
    await db().insert(plans).values({ id: 'L', shareId: 'abc123', activities: { 0: [] }, chartTypes: { 0: 'pie' }, timeUnit: 'day', source: 'legacy', createdAt: 1, updatedAt: 1 });
    expect((await callHandler(handler, { method: 'GET', query: { id: 'abc123' } })).status).toBe(200);
  });
  it('a saved plan\'s share link shows its name but never its owner', async () => {
    const p = await createPlan(db(), 'owner@example.com', { name: 'Week', key: 'week' }, { ...body, timeUnit: 'day', month: null, year: null } as never, 1) as { shareId: string };
    const out = await callHandler(handler, { method: 'GET', query: { id: p.shareId } });
    expect(out.body).toMatchObject({ name: 'Week' });
    expect(JSON.stringify(out.body)).not.toContain('owner@example.com');
  });
});

it('405 for other methods', async () => {
  expect((await callHandler(handler, { method: 'DELETE', query: { id: 'x' } })).status).toBe(405);
});

describe('review focus: renamed saved plans and legacy-shaped rows', () => {
  it('a renamed, re-contented saved plan shows the NEW name and content, with no owner, id or timestamps', async () => {
    const created = await createPlan(db(), 'a@x.com', { name: 'Old', key: 'old' }, { ...body, timeUnit: 'day', month: null, year: null } as never, 1) as { id: string; shareId: string };
    const fresh = { activities: { 0: [{ id: 0, value: 4, label: '' }, { id: 2, value: 20, label: 'new thing' }] }, chartTypes: { 0: 'pie' }, timeUnit: 'week', month: null, year: null };
    await updatePlan(db(), 'a@x.com', created.id, { name: { name: 'Renamed', key: 'renamed' }, payload: fresh as never }, 2);
    const out = await callHandler(handler, { method: 'GET', query: { id: created.shareId } });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ activities: fresh.activities, chart_types: { 0: 'pie' }, time_unit: 'week', month: null, year: null, name: 'Renamed' });
    const wire = JSON.stringify(out.body);
    expect(wire).not.toContain('@');
    expect(wire).not.toContain(created.id);
    expect(Object.keys(out.body as object).sort()).toEqual(['activities', 'chart_types', 'month', 'name', 'time_unit', 'year']);
  });
  it('a legacy row (JSON-text columns, 7-char share id, source legacy) resolves with decoded objects', async () => {
    await db().run(sql`INSERT INTO plans (id, share_id, activities, chart_types, time_unit, month, year, source, created_at, updated_at)
      VALUES ('LEG', 'old-id_7', '{"0":[{"id":1,"value":3,"label":"walk"}]}', '{"0":"pie"}', 'month', 'March', 2020, 'legacy', 1, 1)`);
    const out = await callHandler(handler, { method: 'GET', query: { id: 'old-id_7' } });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ activities: { 0: [{ id: 1, value: 3, label: 'walk' }] }, chart_types: { 0: 'pie' }, time_unit: 'month', month: 'March', year: 2020, name: null });
  });
  it('the GET path bounds ids at 64 chars and does not regex-gate them (64 resolves, 65 is 404)', async () => {
    const id = 'a-b.c_d~'.repeat(8);
    expect(id.length).toBe(64);
    await db().insert(plans).values({ id: 'LONG', shareId: id, activities: {}, chartTypes: {}, timeUnit: 'day', source: 'legacy', createdAt: 1, updatedAt: 1 });
    expect((await callHandler(handler, { method: 'GET', query: { id } })).status).toBe(200);
    expect((await callHandler(handler, { method: 'GET', query: { id: id + 'x' } })).status).toBe(404);
  });
});

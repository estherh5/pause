import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { callHandler } from '../test/http.js';
import { invites } from '../db/schema.js';

const h = vi.hoisted(() => ({ db: null as never, email: null as string | null }));
vi.mock('../db/index.js', () => ({ get db() { return h.db; } }));
vi.mock('../lib/session.js', () => ({
  sessionEmail: async () => h.email,
  sessionUser: async () => (h.email ? { email: h.email, name: null } : null),
}));
const handler = (await import('./plans.js')).default;
const db = () => h.db as Awaited<ReturnType<typeof makeMigratedDb>>;

const A = 'a@example.com';
const B = 'b@example.com';
const plan = { activities: { 0: [{ id: 1, value: 8, label: 'sleep' }] }, chartTypes: { 0: 'pie' }, timeUnit: 'day' };
const as = (email: string | null) => { h.email = email; };
const create = (name: string) => callHandler(handler, { method: 'POST', body: { name, plan } });

beforeEach(async () => {
  h.db = (await makeMigratedDb()) as never;
  for (const e of [A, B]) await db().insert(invites).values({ id: e, email: e, token: `t${e}`, createdAt: 1, expiresAt: 2, acceptedAt: 3 });
  as(A);
});

describe('access', () => {
  it('signed out → 401', async () => { as(null); expect((await callHandler(handler, { method: 'GET' })).status).toBe(401); });
  it('signed in without an invite → 403 no-access', async () => {
    as('stranger@example.com');
    expect(await callHandler(handler, { method: 'GET' })).toMatchObject({ status: 403, body: { error: 'no-access' } });
  });
  it('a removed member (revoked after acceptance) → 403', async () => {
    as('gone@example.com');
    await db().insert(invites).values({ id: 'g', email: 'gone@example.com', token: 'tg', createdAt: 1, expiresAt: 2, acceptedAt: 3, revokedAt: 4 });
    expect((await callHandler(handler, { method: 'GET' })).status).toBe(403);
  });
});

describe("another person's plans are never visible", () => {
  it('list, get, patch and delete of A\'s plan as B all look like a missing plan', async () => {
    const made = await create('Week');
    const id = (made.body as { id: string }).id;
    as(B);
    expect((await callHandler(handler, { method: 'GET' })).body).toEqual([]);
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const out = await callHandler(handler, { method, query: { id }, body: { name: 'x' } });
      expect(out).toMatchObject({ status: 404, body: { error: 'not-found' } });
    }
    const missing = await callHandler(handler, { method: 'GET', query: { id: 'no-such-id' } });
    expect(JSON.stringify(missing.body)).toBe(JSON.stringify({ error: 'not-found' }));
  });
});

describe('CRUD', () => {
  it('creates (201), lists, opens with content, renames, replaces content, deletes (204)', async () => {
    const made = await create('  Week  ');
    expect(made.status).toBe(201);
    const id = (made.body as { id: string }).id;
    expect(made.body).toMatchObject({ name: 'Week', activityCount: 1 });
    expect((await callHandler(handler, { method: 'GET' })).body).toHaveLength(1);
    expect((await callHandler(handler, { method: 'GET', query: { id } })).body).toMatchObject({ name: 'Week', activities: plan.activities, chartTypes: plan.chartTypes });
    expect((await callHandler(handler, { method: 'PATCH', query: { id }, body: { name: 'Good week' } })).body).toMatchObject({ name: 'Good week' });
    const replaced = await callHandler(handler, { method: 'PATCH', query: { id }, body: { plan: { ...plan, activities: { 0: [] } } } });
    expect(replaced.body).toMatchObject({ activityCount: 0 });
    expect((await callHandler(handler, { method: 'DELETE', query: { id } })).status).toBe(204);
    expect((await callHandler(handler, { method: 'GET', query: { id } })).status).toBe(404);
  });
  it('400 with the name message for a blank or 81-character name', async () => {
    expect(await create('   ')).toMatchObject({ status: 400, body: { error: 'Name the plan.' } });
    expect(await create('a'.repeat(81))).toMatchObject({ status: 400, body: { error: 'Keep the name to 80 characters.' } });
  });
  it('400 with the payload message for a bad plan', async () => {
    const out = await callHandler(handler, { method: 'POST', body: { name: 'x', plan: { activities: [] } } });
    expect(out.status).toBe(400);
  });
  it('409 duplicate-name, ignoring case and spacing', async () => {
    await create('My Week');
    expect(await create('my   week')).toMatchObject({ status: 409, body: { error: 'duplicate-name' } });
  });
  it('PATCH with neither name nor plan → 400', async () => {
    const id = ((await create('Week')).body as { id: string }).id;
    expect((await callHandler(handler, { method: 'PATCH', query: { id }, body: {} })).status).toBe(400);
  });
  it('413 over 64 KB', async () => {
    expect((await callHandler(handler, { method: 'POST', body: { name: 'x', plan }, headers: { 'content-length': '70000' } })).status).toBe(413);
  });
});

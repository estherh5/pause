import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { invites } from '../db/schema.js';
import { callHandler } from '../test/http.js';

const h = vi.hoisted(() => ({ db: null as never, user: null as { email: string; name: string | null } | null }));
vi.mock('../db/index.js', () => ({ get db() { return h.db; } }));
vi.mock('../lib/session.js', () => ({
  sessionUser: async () => h.user,
  sessionEmail: async () => h.user?.email.toLowerCase() ?? null,
}));
const handler = (await import('./me.js')).default;

beforeEach(async () => { h.db = (await makeMigratedDb()) as never; h.user = null; });


describe('GET /api/me', () => {
  it('signed out → 200 { state: "signed-out" } (never a 401: sign-in is optional)', async () => {
    const out = await callHandler(handler, { method: 'GET' });
    expect(out).toMatchObject({ status: 200, body: { state: 'signed-out' } });
    expect(out.headers['cache-control']).toBe('no-store');
  });
  it('signed in without an invite → guest', async () => {
    h.user = { email: 'someone@example.com', name: 'S' };
    expect((await callHandler(handler, { method: 'GET' })).body).toEqual({ state: 'guest', email: 'someone@example.com' });
  });
  it('accepted invite → member with name', async () => {
    h.user = { email: 'f@example.com', name: 'F' };
    await (h.db as Awaited<ReturnType<typeof makeMigratedDb>>).insert(invites).values({ id: '1', email: 'f@example.com', token: 't', createdAt: 1, expiresAt: 2, acceptedAt: 3 });
    expect((await callHandler(handler, { method: 'GET' })).body).toEqual({ state: 'member', email: 'f@example.com', name: 'F' });
  });
  it('owner → owner', async () => {
    h.user = { email: 'hoffman.esther@gmail.com', name: 'Esther' };
    expect((await callHandler(handler, { method: 'GET' })).body).toMatchObject({ state: 'owner' });
  });
  it('lowercases the echoed email, like sessionEmail', async () => {
    h.user = { email: 'Mixed@Example.com', name: 'M' };
    expect((await callHandler(handler, { method: 'GET' })).body).toEqual({ state: 'guest', email: 'mixed@example.com' });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { invites, users } from '../db/schema.js';
import { callHandler } from '../test/http.js';

const h = vi.hoisted(() => ({ db: null as never, user: null as { email: string; name: string | null } | null }));
vi.mock('../db/index.js', () => ({ get db() { return h.db; } }));
vi.mock('./session.js', () => ({
  sessionUser: async () => h.user,
  sessionEmail: async () => h.user?.email.toLowerCase() ?? null,
}));
const { requireMember, requireOwner } = await import('./api-helpers.js');
const me = (await import('../api/me.js')).default;

type Db = Awaited<ReturnType<typeof makeMigratedDb>>;
const rows = () => (h.db as Db).select().from(users);

beforeEach(async () => {
  h.db = (await makeMigratedDb()) as never;
  h.user = null;
  vi.stubEnv('OWNER_EMAIL', 'owner@example.com');
});

describe('the visit stamp on the authenticated path', () => {
  it('stamps an accepted invitee, with their session name', async () => {
    await (h.db as Db).insert(invites).values({ id: '1', email: 'friend@example.com', token: 't', createdAt: 1, expiresAt: 2, acceptedAt: 3 });
    h.user = { email: 'Friend@Example.com', name: 'Friend' };
    const out = await callHandler((req, res) => requireMember(req, res), { method: 'GET' });
    expect(out.ended).toBe(false);
    expect(await rows()).toMatchObject([{ email: 'friend@example.com', name: 'Friend' }]);
  });

  it('never stamps a signed-in guest (no invite), and still answers 403', async () => {
    h.user = { email: 'stranger@example.com', name: 'S' };
    expect((await callHandler((req, res) => requireMember(req, res), { method: 'GET' })).status).toBe(403);
    expect(await rows()).toEqual([]);
  });

  it('never stamps a revoked invitee', async () => {
    await (h.db as Db).insert(invites).values({ id: '1', email: 'gone@example.com', token: 't', createdAt: 1, expiresAt: 2, acceptedAt: 3, revokedAt: 4 });
    h.user = { email: 'gone@example.com', name: null };
    await callHandler((req, res) => requireMember(req, res), { method: 'GET' });
    expect(await rows()).toEqual([]);
  });

  it('stamps the owner on an owner-only route', async () => {
    h.user = { email: 'owner@example.com', name: 'Owner' };
    const out = await callHandler((req, res) => requireOwner(req, res), { method: 'GET' });
    expect(out.ended).toBe(false);
    expect(await rows()).toMatchObject([{ email: 'owner@example.com', name: 'Owner' }]);
  });

  it('does not stamp a non-owner refused by requireOwner', async () => {
    h.user = { email: 'stranger@example.com', name: null };
    expect((await callHandler((req, res) => requireOwner(req, res), { method: 'GET' })).status).toBe(403);
    expect(await rows()).toEqual([]);
  });

  it('GET /api/me stamps an admitted person and not a guest', async () => {
    h.user = { email: 'stranger@example.com', name: null };
    expect((await callHandler(me, { method: 'GET' })).body).toMatchObject({ state: 'guest' });
    expect(await rows()).toEqual([]);
    h.user = { email: 'owner@example.com', name: 'Owner' };
    expect((await callHandler(me, { method: 'GET' })).body).toMatchObject({ state: 'owner' });
    expect(await rows()).toHaveLength(1);
  });

  it('a failed stamp never fails the request', async () => {
    await (h.db as Db).insert(invites).values({ id: '1', email: 'friend@example.com', token: 't', createdAt: 1, expiresAt: 2, acceptedAt: 3 });
    await (h.db as Db).run('DROP TABLE users' as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.user = { email: 'friend@example.com', name: null };
    const out = await callHandler(me, { method: 'GET' });
    expect(out).toMatchObject({ status: 200, body: { state: 'member' } });
    expect(err).toHaveBeenCalledWith('last-active stamp failed', expect.any(String));
    err.mockRestore();
  });
});

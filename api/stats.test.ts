import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { callHandler } from '../test/http.js';

const h = vi.hoisted(() => ({ db: null as never, email: null as string | null }));
vi.mock('../db/index.js', () => ({ get db() { return h.db; } }));
vi.mock('../lib/session.js', () => ({ sessionEmail: async () => h.email, sessionUser: async () => null }));
const handler = (await import('./stats.js')).default;

beforeEach(async () => { h.db = (await makeMigratedDb()) as never; h.email = 'hoffman.esther@gmail.com'; });

describe('GET /api/stats', () => {
  it('401 signed out, 403 guest', async () => {
    h.email = null;
    expect((await callHandler(handler, { method: 'GET', query: { tz: 'UTC' } })).status).toBe(401);
    h.email = 'guest@example.com';
    expect((await callHandler(handler, { method: 'GET', query: { tz: 'UTC' } })).status).toBe(403);
  });
  it('400 bad-time-zone for a missing or invalid zone', async () => {
    expect(await callHandler(handler, { method: 'GET', query: { tz: 'Nowhere/Land' } })).toMatchObject({ status: 400, body: { error: 'bad-time-zone' } });
    expect((await callHandler(handler, { method: 'GET' })).status).toBe(400);
  });
  it('200 { empty: true } for an owner with no plans', async () => {
    expect(await callHandler(handler, { method: 'GET', query: { tz: 'America/New_York' } })).toMatchObject({ status: 200, body: { empty: true } });
  });
});

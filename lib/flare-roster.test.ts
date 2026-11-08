import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { users } from '../db/schema.js';
import { pushRoster } from './flare-roster.js';

let db: Awaited<ReturnType<typeof makeMigratedDb>>;
const ok = () => new Response('', { status: 200 });

beforeEach(async () => { db = await makeMigratedDb(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function sent(fetchSpy: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) };
}

describe('pushRoster', () => {
  it('posts the flare/lib/roster-schema.ts payload to FLARE_URL origin + /api/ingest/users', async () => {
    vi.stubEnv('FLARE_URL', 'https://flare.example.com/api/ingest');
    vi.stubEnv('FLARE_ROSTER_KEY', 'roster-key');
    await db.insert(users).values([
      { email: 'a@example.com', name: 'A', createdAt: 1_700_000_000_000, lastActiveAt: 1_800_000_000_000 },
      { email: 'b@example.com', name: null, createdAt: 1_700_000_000_001, lastActiveAt: null },
    ]);
    const fetchSpy = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchSpy);

    await pushRoster(db as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const { url, init, body } = await sent(fetchSpy);
    expect(url).toBe('https://flare.example.com/api/ingest/users');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-flare-roster-key': 'roster-key' });
    expect(body).toEqual({
      users: [
        { externalId: 'a@example.com', email: 'a@example.com', name: 'A', signedUpAt: 1_700_000_000_000, lastSeenAt: 1_800_000_000_000 },
        { externalId: 'b@example.com', email: 'b@example.com', name: null, signedUpAt: 1_700_000_000_001, lastSeenAt: null },
      ],
      skippedCount: 0,
    });
    // flare keeps a timestamp only when it is a finite NUMBER; a string is dropped silently.
    expect(typeof body.users[0].signedUpAt).toBe('number');
    expect(typeof body.users[0].lastSeenAt).toBe('number');
    expect(Object.keys(body.users[1])).toContain('lastSeenAt');
  });

  it('works when FLARE_URL is a bare origin', async () => {
    vi.stubEnv('FLARE_URL', 'https://flare.example.com');
    const fetchSpy = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchSpy);
    await pushRoster(db as never);
    expect((await sent(fetchSpy)).url).toBe('https://flare.example.com/api/ingest/users');
    expect((await sent(fetchSpy)).body).toEqual({ users: [], skippedCount: 0 });
  });

  it('skips and logs, without throwing, when FLARE_URL is unset', async () => {
    vi.stubEnv('FLARE_URL', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(pushRoster(db as never)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('FLARE_URL is not set'));
    err.mockRestore();
  });

  it('logs a non-2xx from flare without throwing', async () => {
    vi.stubEnv('FLARE_URL', 'https://flare.example.com/api/ingest');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(pushRoster(db as never)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith('flare roster push failed: 401');
    err.mockRestore();
  });
});

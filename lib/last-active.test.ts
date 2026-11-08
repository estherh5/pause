import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { users } from '../db/schema.js';
import { LAST_ACTIVE_THROTTLE_MS, recordActive, touchLastActive } from './last-active.js';

// Against a real table replayed from drizzle/*.sql: only a real row can say
// whether the conditional upsert moved it.
let db: Awaited<ReturnType<typeof makeMigratedDb>>;
const T0 = 1_800_000_000_000;
const stored = async () => db.select().from(users);

beforeEach(async () => { db = await makeMigratedDb(); });

describe('touchLastActive', () => {
  it('creates the row on the first visit: lowercased email, created_at = last_active_at = now', async () => {
    await touchLastActive(db as never, { email: 'Friend@Example.com', name: 'Friend' }, T0);
    expect(await stored()).toEqual([{ email: 'friend@example.com', name: 'Friend', createdAt: T0, lastActiveAt: T0 }]);
  });

  it('writes nothing inside the hour', async () => {
    await touchLastActive(db as never, { email: 'a@example.com', name: 'A' }, T0);
    await touchLastActive(db as never, { email: 'a@example.com', name: 'Renamed' }, T0 + LAST_ACTIVE_THROTTLE_MS - 1);
    expect(await stored()).toEqual([{ email: 'a@example.com', name: 'A', createdAt: T0, lastActiveAt: T0 }]);
  });

  it('stamps again once the hour has passed, and never moves created_at', async () => {
    await touchLastActive(db as never, { email: 'a@example.com', name: 'A' }, T0);
    const later = T0 + LAST_ACTIVE_THROTTLE_MS + 1;
    await touchLastActive(db as never, { email: 'a@example.com', name: 'Renamed' }, later);
    expect(await stored()).toEqual([{ email: 'a@example.com', name: 'Renamed', createdAt: T0, lastActiveAt: later }]);
  });

  it('keeps the stored name when the session has none', async () => {
    await touchLastActive(db as never, { email: 'a@example.com', name: 'A' }, T0);
    await touchLastActive(db as never, { email: 'a@example.com', name: null }, T0 + 2 * LAST_ACTIVE_THROTTLE_MS);
    expect((await stored())[0].name).toBe('A');
  });

  it('stamps a row whose last_active_at is NULL (the comparison alone never would)', async () => {
    await db.insert(users).values({ email: 'a@example.com', name: null, createdAt: 1, lastActiveAt: null });
    await touchLastActive(db as never, { email: 'a@example.com', name: null }, T0);
    expect((await stored())[0]).toMatchObject({ createdAt: 1, lastActiveAt: T0 });
  });

  it('pins the throttle at one hour', () => {
    expect(LAST_ACTIVE_THROTTLE_MS).toBe(3_600_000);
  });
});

describe('recordActive', () => {
  it('swallows a database failure and logs only the error name', async () => {
    const broken = { insert: () => { throw new TypeError('db down: a@example.com'); } };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordActive(broken as never, { email: 'a@example.com', name: null }, T0)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith('last-active stamp failed', 'TypeError');
    err.mockRestore();
  });
});

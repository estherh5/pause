import { describe, it, expect } from 'vitest';
import { makeMigratedDb } from './db-from-migrations.js';
import { plans } from '../db/schema.js';

const base = {
  activities: { 0: [] }, chartTypes: { 0: 'pie' as const }, timeUnit: 'day',
  month: null, year: null, createdAt: 1, updatedAt: 1,
};
// drizzle-orm 0.45 wraps libsql errors in DrizzleQueryError; the SQLite text is on .cause.
const unique = { cause: { message: expect.stringMatching(/UNIQUE/) } };

describe('plans schema (replayed from drizzle/*.sql)', () => {
  it('rejects two plans with the same owner and name_key', async () => {
    const db = await makeMigratedDb();
    await db.insert(plans).values({ ...base, id: 'a', shareId: 'AAAAAAAAAAAAAAAA', ownerEmail: 'x@y.z', name: 'Week', nameKey: 'week' });
    await expect(
      db.insert(plans).values({ ...base, id: 'b', shareId: 'BBBBBBBBBBBBBBBB', ownerEmail: 'x@y.z', name: 'WEEK', nameKey: 'week' }),
    ).rejects.toMatchObject(unique);
  });

  it('allows any number of anonymous rows (NULL owner, NULL name_key)', async () => {
    const db = await makeMigratedDb();
    await db.insert(plans).values({ ...base, id: 'a', shareId: 'AAAAAAAAAAAAAAAA' });
    await db.insert(plans).values({ ...base, id: 'b', shareId: 'BBBBBBBBBBBBBBBB' });
    expect(await db.select().from(plans)).toHaveLength(2);
  });

  it('rejects a duplicate share_id', async () => {
    const db = await makeMigratedDb();
    await db.insert(plans).values({ ...base, id: 'a', shareId: 'AAAAAAAAAAAAAAAA' });
    await expect(db.insert(plans).values({ ...base, id: 'b', shareId: 'AAAAAAAAAAAAAAAA' })).rejects.toMatchObject(unique);
  });

  it('defaults source to web and round-trips JSON columns', async () => {
    const db = await makeMigratedDb();
    await db.insert(plans).values({ ...base, id: 'a', shareId: 'AAAAAAAAAAAAAAAA', activities: { 0: [{ id: 1, value: 8, label: 'sleep' }] } });
    const [row] = await db.select().from(plans);
    expect(row.source).toBe('web');
    expect(row.activities).toEqual({ 0: [{ id: 1, value: 8, label: 'sleep' }] });
  });
});

import { describe, it, expect } from 'vitest';
import { makeMigratedDb } from './db-from-migrations.js';
import { sql } from 'drizzle-orm';
import { feedback, feedbackMessages, plans } from '../db/schema.js';

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

describe('feedback_messages inbound columns (replayed from drizzle/*.sql)', () => {
  it('defaults channel to web, and rejects a second row with the same source_message_id', async () => {
    const db = await makeMigratedDb();
    await db.insert(feedback).values({ id: 'f', userEmail: 'u@x.com', type: 'bug', message: 'm', createdAt: 't' });
    await db.insert(feedbackMessages).values({ id: 'a', feedbackId: 'f', author: 'admin', body: 'b', createdAt: 't' });
    expect((await db.select().from(feedbackMessages))[0].channel).toBe('web');
    await db.insert(feedbackMessages).values({ id: 'b', feedbackId: 'f', author: 'user', channel: 'email', body: 'b', sourceMessageId: 'm1', createdAt: 't' });
    await expect(
      db.insert(feedbackMessages).values({ id: 'c', feedbackId: 'f', author: 'user', channel: 'email', body: 'b', sourceMessageId: 'm1', createdAt: 't' }),
    ).rejects.toMatchObject(unique);
  });

  it('still cascades a feedback delete to its messages', async () => {
    const db = await makeMigratedDb();
    await db.run(sql`PRAGMA foreign_keys = ON`);
    await db.insert(feedback).values({ id: 'f', userEmail: 'u@x.com', type: 'bug', message: 'm', createdAt: 't' });
    await db.insert(feedbackMessages).values({ id: 'a', feedbackId: 'f', author: 'user', channel: 'email', body: 'b', sourceMessageId: 'm1', createdAt: 't' });
    await db.delete(feedback);
    expect(await db.select().from(feedbackMessages)).toHaveLength(0);
  });
});

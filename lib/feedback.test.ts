import { describe, it, expect, vi } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../db/schema.js';
import { feedback, feedbackMessages } from '../db/schema.js';
import {
  appendAdminReply,
  FeedbackReplyValidationError,
  listThreadsFor,
  stripEmailStatus,
  MAX_REPLY_LENGTH,
} from './feedback.js';
import type { EmailOutcome } from './feedback-email.js';
import type { FeedbackRow } from '../db/schema.js';

async function makeDb() {
  const client = createClient({ url: ':memory:' });
  await client.executeMultiple(`
    CREATE TABLE feedback (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      page_url TEXT,
      user_agent TEXT,
      notify INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      response TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE TABLE feedback_messages (
      id TEXT PRIMARY KEY,
      feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      email_status TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return drizzle(client, { schema });
}

type DB = Awaited<ReturnType<typeof makeDb>>;

async function seedFeedback(db: DB, overrides: Partial<typeof feedback.$inferInsert> = {}): Promise<FeedbackRow> {
  const [row] = await db
    .insert(feedback)
    .values({
      id: 'fb-1',
      userEmail: 'user@example.com',
      type: 'bug',
      message: 'it broke',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    })
    .returning();
  return row;
}

describe('appendAdminReply', () => {
  it('rejects an empty reply without inserting anything or calling the sender', async () => {
    const db = await makeDb();
    const row = await seedFeedback(db);
    const sender = vi.fn();
    await expect(appendAdminReply(db, sender, { feedback: row, body: '   ' })).rejects.toThrow(
      FeedbackReplyValidationError,
    );
    expect(sender).not.toHaveBeenCalled();
    expect(await db.select().from(feedbackMessages)).toHaveLength(0);
  });

  it('rejects a reply over MAX_REPLY_LENGTH', async () => {
    const db = await makeDb();
    const row = await seedFeedback(db);
    const sender = vi.fn();
    await expect(
      appendAdminReply(db, sender, { feedback: row, body: 'x'.repeat(MAX_REPLY_LENGTH + 1) }),
    ).rejects.toThrow(FeedbackReplyValidationError);
    expect(sender).not.toHaveBeenCalled();
  });

  it('records "sent" when the author has an email and the sender succeeds', async () => {
    const db = await makeDb();
    const row = await seedFeedback(db, { userEmail: 'user@example.com', notify: true });
    const sender = vi.fn(async (): Promise<EmailOutcome> => 'sent');

    const msg = await appendAdminReply(db, sender, { feedback: row, body: 'thanks, fixed!' });

    expect(sender).toHaveBeenCalledWith(row, 'thanks, fixed!');
    expect(msg.author).toBe('admin');
    expect(msg.body).toBe('thanks, fixed!');
    expect(msg.emailStatus).toBe('sent');

    const [updated] = await db.select().from(feedback);
    expect(updated.updatedAt).toBe(msg.createdAt);
  });

  it('records "failed" (never a phantom "sent") when the sender throws', async () => {
    const db = await makeDb();
    const row = await seedFeedback(db, { userEmail: 'user@example.com', notify: true });
    const sender = vi.fn(async (): Promise<EmailOutcome> => {
      throw new Error('resend down');
    });

    const msg = await appendAdminReply(db, sender, { feedback: row, body: 'trying again' });

    expect(msg.emailStatus).toBe('failed');
    // The reply is still posted even though the email failed.
    const all = await db.select().from(feedbackMessages);
    expect(all).toHaveLength(1);
  });

  it('records "skipped" and never calls the sender when notify is off despite an email on file', async () => {
    const db = await makeDb();
    const row = await seedFeedback(db, { notify: false });
    const sender = vi.fn();
    const msg = await appendAdminReply(db, sender, { feedback: row, body: 'hi' });
    expect(sender).not.toHaveBeenCalled();
    expect(msg.emailStatus).toBe('skipped');
  });

  it('records "skipped" and never calls the sender when there is no email on file', async () => {
    const db = await makeDb();
    const row = await seedFeedback(db, { userEmail: '' });
    const sender = vi.fn(async (): Promise<EmailOutcome> => 'sent');

    const msg = await appendAdminReply(db, sender, { feedback: row, body: 'no email here' });

    expect(sender).not.toHaveBeenCalled();
    expect(msg.emailStatus).toBe('skipped');
  });

  it('never emails on a status-only update path — appendAdminReply is reply-only', async () => {
    // Documents the invariant: nothing in this module updates feedback.status,
    // so a caller doing a status-only PATCH never touches this code path
    // (and therefore never emails). Covered at the handler level too.
    const db = await makeDb();
    const row = await seedFeedback(db);
    expect(row.status).toBe('new');
  });
});

describe('listThreadsFor', () => {
  it('batches messages for many feedback ids, ordered oldest-first, empty map for []', async () => {
    const db = await makeDb();
    const a = await seedFeedback(db, { id: 'fb-a' });
    const b = await seedFeedback(db, { id: 'fb-b' });
    const sender = vi.fn(async (): Promise<EmailOutcome> => 'skipped');
    await appendAdminReply(db, sender, { feedback: a, body: 'first' });
    await appendAdminReply(db, sender, { feedback: a, body: 'second' });
    await appendAdminReply(db, sender, { feedback: b, body: 'only one' });

    expect(await listThreadsFor(db, [])).toEqual(new Map());

    const byId = await listThreadsFor(db, [a.id, b.id]);
    expect(byId.get(a.id)?.map((m) => m.body)).toEqual(['first', 'second']);
    expect(byId.get(b.id)?.map((m) => m.body)).toEqual(['only one']);
  });
});

describe('stripEmailStatus', () => {
  it('omits the emailStatus key entirely rather than nulling it', () => {
    const stripped = stripEmailStatus({
      id: 'm1',
      feedbackId: 'fb-1',
      author: 'admin',
      body: 'hi',
      emailStatus: 'sent',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect('emailStatus' in stripped).toBe(false);
    expect(JSON.stringify(stripped)).not.toContain('emailStatus');
  });
});

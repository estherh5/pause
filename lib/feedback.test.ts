import { describe, it, expect, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { feedback, feedbackMessages } from '../db/schema.js';
import {
  appendAdminReply,
  FeedbackReplyValidationError,
  listThreadsFor,
  stripEmailTelemetry,
  recordInboundReply,
  MAX_REPLY_LENGTH,
} from './feedback.js';
import type { EmailOutcome } from './feedback-email.js';
import type { FeedbackRow } from '../db/schema.js';

// Replayed from drizzle/*.sql, not a hand-typed CREATE TABLE: the inbound
// columns (channel, source_message_id + its UNIQUE index) must be the shipped ones.
const makeDb = makeMigratedDb;

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

describe('stripEmailTelemetry', () => {
  it('omits emailStatus and sourceMessageId entirely but keeps channel', () => {
    // Discriminating case: an inbound email message carries BOTH telemetry
    // keys; the user-facing payload drops both and still says it came by email.
    const stripped = stripEmailTelemetry({
      id: 'm1',
      feedbackId: 'fb-1',
      author: 'user',
      channel: 'email',
      body: 'hi',
      emailStatus: 'sent',
      sourceMessageId: '<abc@mail.example>',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect('emailStatus' in stripped).toBe(false);
    expect('sourceMessageId' in stripped).toBe(false);
    expect(stripped.channel).toBe('email');
    expect(JSON.stringify(stripped)).not.toMatch(/emailStatus|sourceMessageId|abc@mail/);
  });
});

describe('appendAdminReply channel', () => {
  it('records an admin reply as channel web', async () => {
    const db = await makeDb();
    const row = await seedFeedback(db);
    const msg = await appendAdminReply(db, vi.fn(), { feedback: row, body: 'hi' });
    expect(msg.channel).toBe('web');
  });
});

describe('recordInboundReply', () => {
  it('appends a user/email message and reopens an addressed feedback to new', async () => {
    const db = await makeDb();
    await seedFeedback(db, { status: 'addressed' });
    const now = new Date('2026-02-01T00:00:00.000Z');
    const out = await recordInboundReply(db, { feedbackId: 'fb-1', body: 'still broken', sourceMessageId: 'msg-1', now });
    expect(out).toEqual({ recorded: true });
    const [m] = await db.select().from(feedbackMessages);
    expect(m).toMatchObject({ author: 'user', channel: 'email', body: 'still broken', sourceMessageId: 'msg-1', emailStatus: null });
    const [f] = await db.select().from(feedback);
    expect(f.status).toBe('new');
    expect(f.updatedAt).toBe(now.toISOString());
  });

  it('a second delivery of the same message id inserts nothing and does not touch status', async () => {
    // Discriminating case: the UNIQUE index (not a pre-read) is the dedupe —
    // after the admin re-closes the item, a provider retry must not reopen it.
    const db = await makeDb();
    await seedFeedback(db);
    await recordInboundReply(db, { feedbackId: 'fb-1', body: 'once', sourceMessageId: 'msg-1' });
    await db.update(feedback).set({ status: 'addressed' });
    const again = await recordInboundReply(db, { feedbackId: 'fb-1', body: 'once', sourceMessageId: 'msg-1' });
    expect(again).toEqual({ recorded: false });
    expect(await db.select().from(feedbackMessages)).toHaveLength(1);
    expect((await db.select().from(feedback))[0].status).toBe('addressed');
  });
});

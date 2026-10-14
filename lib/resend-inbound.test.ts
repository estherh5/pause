import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { feedback, feedbackMessages } from '../db/schema.js';
import { encodeReplyAddress, signFeedbackId } from './feedback-thread-address.js';
import { REPLY_SEPARATOR } from './email-reply-parser.js';
import { processInboundEmail, type ParsedInboundEmail } from './resend-inbound.js';

const SECRET = 'secret';
let db: Awaited<ReturnType<typeof makeMigratedDb>>;

beforeEach(async () => {
  db = await makeMigratedDb();
  await db.insert(feedback).values({
    id: 'f1', userEmail: 'u@x.com', type: 'bug', message: 'm',
    status: 'addressed', notify: true, createdAt: '2026-01-01T00:00:00.000Z',
  });
});

function email(over: Partial<ParsedInboundEmail>): ParsedInboundEmail {
  return {
    toAddresses: [encodeReplyAddress('f1', SECRET, 'crystalprism.io')],
    fromAddress: 'u@x.com',
    text: `still broken\n\n${REPLY_SEPARATOR}\n> old`,
    headers: {},
    messageId: 'm-1',
    ...over,
  };
}

const thread = () => db.select().from(feedbackMessages);

describe('processInboundEmail', () => {
  it('records a valid reply as user/email, reopens feedback to new, and notifies once', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const res = await processInboundEmail(db, email({}), SECRET, notify);
    expect(res.status).toBe('recorded');
    expect(notify).toHaveBeenCalledWith({ fromEmail: 'u@x.com', excerpt: 'still broken' });
    expect((await thread()).at(-1)).toMatchObject({
      author: 'user', channel: 'email', body: 'still broken', sourceMessageId: 'm-1',
    });
    expect((await db.select().from(feedback))[0].status).toBe('new');
  });

  it('ignores an address whose HMAC does not match (right prefix, forged signature)', async () => {
    const notify = vi.fn();
    const res = await processInboundEmail(
      db, email({ toAddresses: ['reply+a.f1.deadbeefdeadbeef@crystalprism.io'] }), SECRET, notify,
    );
    expect(res).toEqual({ status: 'ignored', reason: 'no matching address' });
    expect(await thread()).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("ignores another app's mail: foreign prefix x with an otherwise valid signature", async () => {
    // Discriminating case: the signature is one pause could have produced for
    // f1 — only the prefix says it is not pause's.
    const res = await processInboundEmail(
      db, email({ toAddresses: [`reply+x.f1.${signFeedbackId('f1', SECRET)}@crystalprism.io`] }), SECRET, vi.fn(),
    );
    expect(res).toEqual({ status: 'ignored', reason: 'no matching address' });
    expect(await thread()).toHaveLength(0);
  });

  it('ignores an auto-reply', async () => {
    const res = await processInboundEmail(db, email({ headers: { 'Auto-Submitted': 'auto-replied' } }), SECRET, vi.fn());
    expect(res).toEqual({ status: 'ignored', reason: 'auto-reply' });
  });

  it('ignores an empty body after stripping the quoted history', async () => {
    const res = await processInboundEmail(db, email({ text: `${REPLY_SEPARATOR}\n> only quotes` }), SECRET, vi.fn());
    expect(res).toEqual({ status: 'ignored', reason: 'empty body' });
  });

  it('ignores a validly signed feedback id that does not exist', async () => {
    const res = await processInboundEmail(
      db, email({ toAddresses: [encodeReplyAddress('nope', SECRET, 'crystalprism.io')] }), SECRET, vi.fn(),
    );
    expect(res).toEqual({ status: 'ignored', reason: 'feedback not found' });
  });

  it('is a no-op on a repeated delivery of the same messageId (one row, one notification)', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    await processInboundEmail(db, email({}), SECRET, notify);
    const again = await processInboundEmail(db, email({}), SECRET, notify);
    expect(again).toEqual({ status: 'ignored', reason: 'duplicate' });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(await thread()).toHaveLength(1);
  });
});

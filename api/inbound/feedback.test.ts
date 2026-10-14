import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { makeMigratedDb } from '../../test/db-from-migrations.js';
import { feedback, feedbackMessages } from '../../db/schema.js';
import { encodeReplyAddress, signFeedbackId } from '../../lib/feedback-thread-address.js';
import type { ParsedInboundEmail } from '../../lib/resend-inbound.js';
import type { VercelRequest, VercelResponse } from '../../lib/vercel.js';

// Only the network edges are mocked: Resend's receiving API and the owner
// notification. The pipeline and the DB (replayed from drizzle/*.sql) are real.
const h = vi.hoisted(() => ({ db: null as never, fetched: null as ParsedInboundEmail | null }));
vi.mock('../../db/index.js', () => ({ get db() { return h.db; } }));
vi.mock('../../lib/resend-inbound.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/resend-inbound.js')>()),
  fetchInboundEmail: vi.fn(async () => {
    if (!h.fetched) throw new Error('resend receiving API down');
    return h.fetched;
  }),
}));
const notify = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../lib/feedback-email.js', () => ({ sendInboundReplyNotification: notify }));

const handler = (await import('./feedback.js')).default;
const db = () => h.db as Awaited<ReturnType<typeof makeMigratedDb>>;

const REPLY_SECRET = 'test-reply-secret';
// Svix's secret shape, whsec_<base64 key>, built at runtime from a throwaway key.
const whsec = (key: string) => `whsec_${Buffer.from(key).toString('base64')}`;
const WEBHOOK_SECRET = whsec('pause-inbound-test-key');

function svixHeaders(body: string, secret = WEBHOOK_SECRET): Record<string, string> {
  const id = 'msg_test';
  const ts = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
}

/** A real readable stream, so the handler's raw-body read is exercised. */
async function call(opts: { method?: string; body?: string; headers?: Record<string, string> }) {
  const out = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const req = Object.assign(Readable.from(opts.body === undefined ? [] : [Buffer.from(opts.body)]), {
    method: opts.method ?? 'POST',
    url: '/api/inbound/feedback',
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    query: {},
    cookies: {},
  }) as unknown as VercelRequest;
  const res = {
    headersSent: false,
    status(c: number) { out.status = c; return res; },
    json(v: unknown) { out.body = v; res.headersSent = true; return res; },
    end(v?: unknown) { out.body = v; res.headersSent = true; return res; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; return res; },
  } as unknown as VercelResponse & { headersSent: boolean };
  await handler(req, res);
  return out;
}

const event = JSON.stringify({ type: 'email.received', data: { email_id: 'e1' } });
const signed = (body = event) => call({ body, headers: svixHeaders(body) });

function mail(over: Partial<ParsedInboundEmail> = {}): ParsedInboundEmail {
  return {
    toAddresses: [encodeReplyAddress('f1', REPLY_SECRET, 'crystalprism.io')],
    fromAddress: 'u@x.com',
    text: 'still broken\n\nOn Mon, Oct 12, 2026 at 9:00 AM Pause <pause@crystalprism.io> wrote:\n> hi',
    headers: {},
    messageId: '<m-1@mail.example>',
    ...over,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  h.db = (await makeMigratedDb()) as never;
  h.fetched = mail();
  await db().insert(feedback).values({
    id: 'f1', userEmail: 'u@x.com', type: 'bug', message: 'm', status: 'addressed', notify: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  process.env.FEEDBACK_REPLY_SECRET = REPLY_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
});
afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.RESEND_WEBHOOK_SECRET;
  delete process.env.FEEDBACK_REPLY_SECRET;
});

describe('POST /api/inbound/feedback — method', () => {
  it('GET is 405 and touches nothing', async () => {
    const out = await call({ method: 'GET' });
    expect(out.status).toBe(405);
    expect(out.headers.allow).toBe('POST');
    expect(await db().select().from(feedbackMessages)).toHaveLength(0);
  });
});

describe('POST /api/inbound/feedback — without RESEND_WEBHOOK_SECRET', () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = ''; // how a Sensitive var pulls: empty, not absent
  });

  it('refuses unsigned mail with 401 on production (fails closed)', async () => {
    process.env.VERCEL_ENV = 'production';
    const out = await call({ body: event });
    expect(out.status).toBe(401);
    expect(await db().select().from(feedbackMessages)).toHaveLength(0);
  });

  it('accepts the same unsigned mail off production (fails open for previews and dev)', async () => {
    process.env.VERCEL_ENV = 'preview';
    const out = await call({ body: event });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ok: true, status: 'recorded' });
  });
});

describe('POST /api/inbound/feedback — signed', () => {
  it('records a correctly signed reply on the raw bytes, reopens the feedback, notifies the owner', async () => {
    process.env.VERCEL_ENV = 'production';
    const out = await signed();
    expect(out).toMatchObject({ status: 200, body: { ok: true, status: 'recorded' } });
    const [m] = await db().select().from(feedbackMessages);
    expect(m).toMatchObject({ author: 'user', channel: 'email', body: 'still broken', sourceMessageId: '<m-1@mail.example>' });
    expect((await db().select().from(feedback))[0].status).toBe('new');
    expect(notify).toHaveBeenCalledWith({ fromEmail: 'u@x.com', excerpt: 'still broken' });
  });

  it('401s when the body differs by one byte from what was signed', async () => {
    // Discriminating case: headers valid for `event`, body re-serialized with a space.
    const out = await call({ body: event.replace(':', ': '), headers: svixHeaders(event) });
    expect(out.status).toBe(401);
    expect(await db().select().from(feedbackMessages)).toHaveLength(0);
  });

  it('401s a signature made with another webhook secret', async () => {
    const out = await call({ body: event, headers: svixHeaders(event, whsec('some-other-key')) });
    expect(out.status).toBe(401);
  });

  it("is a quiet 200 no-op for another app's mail (foreign prefix x, valid HMAC for f1)", async () => {
    h.fetched = mail({ toAddresses: [`reply+x.f1.${signFeedbackId('f1', REPLY_SECRET)}@crystalprism.io`] });
    const out = await signed();
    expect(out).toMatchObject({ status: 200, body: { ok: true, status: 'ignored', reason: 'no matching address' } });
    expect(await db().select().from(feedbackMessages)).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('is a quiet 200 no-op for pause prefix with a bad HMAC', async () => {
    h.fetched = mail({ toAddresses: ['reply+a.f1.deadbeefdeadbeef@crystalprism.io'] });
    const out = await signed();
    expect(out).toMatchObject({ status: 200, body: { ok: true, status: 'ignored' } });
    expect(await db().select().from(feedbackMessages)).toHaveLength(0);
  });

  it('is a quiet 200 no-op on a duplicate delivery of the same message id', async () => {
    await signed();
    await db().update(feedback).set({ status: 'addressed' });
    const again = await signed();
    expect(again).toMatchObject({ status: 200, body: { ok: true, status: 'ignored', reason: 'duplicate' } });
    expect(await db().select().from(feedbackMessages)).toHaveLength(1);
    expect((await db().select().from(feedback))[0].status).toBe('addressed');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('ignores events other than email.received', async () => {
    const out = await signed(JSON.stringify({ type: 'email.sent', data: { email_id: 'e1' } }));
    expect(out).toMatchObject({ status: 200, body: { ok: true, ignored: 'event type' } });
  });

  it('still answers 200 when processing throws (no provider retry storm)', async () => {
    h.fetched = null;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await signed();
    expect(out).toMatchObject({ status: 200, body: { ok: false, error: 'processing failed' } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { callHandler } from '../test/http.js';
import { invites, feedback, feedbackMessages } from '../db/schema.js';

const h = vi.hoisted(() => ({ db: null as never, email: null as string | null }));
vi.mock('../db/index.js', () => ({ get db() { return h.db; } }));
vi.mock('../lib/session.js', () => ({
  sessionEmail: async () => h.email,
  sessionUser: async () => (h.email ? { email: h.email, name: null } : null),
}));
vi.mock('../lib/feedback-email.js', () => ({
  makeFeedbackReplySender: () => async () => 'sent' as const,
}));
const handler = (await import('./feedback.js')).default;
const db = () => h.db as Awaited<ReturnType<typeof makeMigratedDb>>;

const OWNER = 'hoffman.esther@gmail.com';
const A = 'a@example.com';
const B = 'b@example.com';
const as = (email: string | null) => { h.email = email; };
const call = (opts: Parameters<typeof callHandler>[1]) => callHandler(handler, opts);
const file = (message = 'it broke') => call({ method: 'POST', body: { type: 'bug', message, pageUrl: '/stats', notify: true } });

beforeEach(async () => {
  h.db = (await makeMigratedDb()) as never;
  for (const e of [A, B]) await db().insert(invites).values({ id: e, email: e, token: `t${e}`, createdAt: 1, expiresAt: 2, acceptedAt: 3 });
  as(A);
});

describe('filing', () => {
  it('a guest (signed in, no invite) cannot file feedback', async () => {
    as('guest@example.com');
    const out = await call({ method: 'POST', body: { type: 'bug', message: 'x' } });
    expect(out.status).toBe(403);
  });
  it('signed out gets 401', async () => {
    as(null);
    expect((await call({ method: 'POST', body: { message: 'x' } })).status).toBe(401);
  });
  it('a member files feedback under their own email, with no screenshot field', async () => {
    const out = await file();
    expect(out.status).toBe(201);
    expect(out.body).toMatchObject({ userEmail: A, type: 'bug', message: 'it broke', pageUrl: '/stats', notify: true, status: 'new' });
    expect(out.body).not.toHaveProperty('screenshotUrl');
  });
  it('rejects an empty message with 400', async () => {
    expect((await file('   ')).status).toBe(400);
  });
});

describe('member reads own threads', () => {
  it('GET ?mine=1 returns only my rows, with emailStatus stripped from messages', async () => {
    await file('mine');
    as(B);
    await file('theirs');
    const mineId = (await db().select().from(feedback)).find((r) => r.message === 'mine')!.id;
    await db().insert(feedbackMessages).values({ id: 'm1', feedbackId: mineId, author: 'admin', body: 'hi', emailStatus: 'sent', createdAt: '2026-01-02T00:00:00.000Z' });
    as(A);
    const out = await call({ method: 'GET', query: { mine: '1' } });
    expect(out.status).toBe(200);
    const rows = out.body as Array<{ message: string; messages: Array<Record<string, unknown>> }>;
    expect(rows.map((r) => r.message)).toEqual(['mine']);
    expect(rows[0].messages).toHaveLength(1);
    expect(rows[0].messages[0]).not.toHaveProperty('emailStatus');
    expect(JSON.stringify(rows)).not.toContain('emailStatus');
  });
});

describe('member reads an emailed reply', () => {
  it('GET ?mine=1 keeps channel but drops sourceMessageId and emailStatus', async () => {
    // Discriminating case: a user/email message is the only kind that carries
    // a provider message id; it must not reach the member's payload.
    await file('mine');
    const [row] = await db().select().from(feedback);
    await db().insert(feedbackMessages).values({
      id: 'm1', feedbackId: row.id, author: 'user', channel: 'email', body: 'by mail',
      sourceMessageId: '<secret-id@mail.example>', createdAt: '2026-01-02T00:00:00.000Z',
    });
    const out = await call({ method: 'GET', query: { mine: '1' } });
    const [r] = out.body as Array<{ messages: Array<Record<string, unknown>> }>;
    expect(r.messages[0].channel).toBe('email');
    expect(JSON.stringify(out.body)).not.toMatch(/sourceMessageId|secret-id|emailStatus/);
  });
});

describe('owner routes', () => {
  it('plain GET lists everyone with delivery marks intact', async () => {
    await file('one');
    const [row] = await db().select().from(feedback);
    await db().insert(feedbackMessages).values({ id: 'm1', feedbackId: row.id, author: 'admin', body: 'r', emailStatus: 'failed', createdAt: '2026-01-01T00:00:00.000Z' });
    as(OWNER);
    const out = await call({ method: 'GET' });
    const rows = out.body as Array<{ messages: Array<{ emailStatus: string }> }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].messages[0].emailStatus).toBe('failed');
  });
  it('PATCH ?id sets status; rejects a bad status; 404 for a missing id', async () => {
    const id = ((await file()).body as { id: string }).id;
    as(OWNER);
    expect((await call({ method: 'PATCH', query: { id }, body: { status: 'addressed' } })).body).toMatchObject({ id, status: 'addressed' });
    expect((await call({ method: 'PATCH', query: { id }, body: { status: 'nope' } })).status).toBe(400);
    expect((await call({ method: 'PATCH', query: { id: 'zzz' }, body: { status: 'declined' } })).status).toBe(404);
  });
  it('POST ?id&action=reply appends an admin message (201), 400 on an empty body', async () => {
    const id = ((await file()).body as { id: string }).id;
    as(OWNER);
    const out = await call({ method: 'POST', query: { id, action: 'reply' }, body: { body: 'fixed it' } });
    expect(out.status).toBe(201);
    expect(out.body).toMatchObject({ feedbackId: id, author: 'admin', body: 'fixed it', emailStatus: 'sent' });
    expect((await call({ method: 'POST', query: { id, action: 'reply' }, body: { body: '  ' } })).status).toBe(400);
  });
  it('a member (non-owner) gets 403 on every owner route; signed out gets 401', async () => {
    const id = ((await file()).body as { id: string }).id;
    expect((await call({ method: 'GET' })).status).toBe(403);
    expect((await call({ method: 'PATCH', query: { id }, body: { status: 'addressed' } })).status).toBe(403);
    expect((await call({ method: 'POST', query: { id, action: 'reply' }, body: { body: 'x' } })).status).toBe(403);
    as(null);
    expect((await call({ method: 'GET' })).status).toBe(401);
  });
});

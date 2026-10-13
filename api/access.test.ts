import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '../lib/vercel.js';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { invites } from '../db/schema.js';

const h = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof import('../test/db-from-migrations.js').makeMigratedDb>>,
  email: null as string | null,
  sent: [] as Array<{ to: string; token: string }>,
}));

vi.mock('../db/index.js', () => ({ get db() { return h.db; } }));
// The session is the only thing mocked about identity: everything below the
// cookie — roleForEmail, requireOwner — runs for real, because the gate IS the
// thing under test.
vi.mock('../lib/session.js', () => ({
  sessionEmail: async () => h.email,
  sessionUser: async () => (h.email ? { email: h.email } : null),
}));
vi.mock('../lib/invite-email.js', () => ({
  sendAccountInvite: async (to: string, o: { token: string }) => { h.sent.push({ to, token: o.token }); return 'sent' as const; },
}));

const handler = (await import('./access.js')).default;
const { roleForEmail } = await import('../lib/admission.js');

const OWNER = 'hoffman.esther@gmail.com';

/** A minimal (req, res) pair that records what the handler did. */
function call(opts: { method: string; query?: Record<string, string>; body?: unknown }) {
  const out: { status: number; json?: unknown; ended: boolean; headers: Record<string, string> } = {
    status: 200, ended: false, headers: {},
  };
  const res = {
    status(c: number) { out.status = c; return res; },
    json(v: unknown) { out.json = v; out.ended = true; return res; },
    end() { out.ended = true; return res; },
    setHeader(k: string, v: string) { out.headers[k] = v; },
  } as unknown as VercelResponse;
  // `resource` is what selects the invitations half of the access endpoint —
  // set here rather than at every call site, since this whole file is about it.
  const query = { resource: 'invites', ...(opts.query ?? {}) };
  const req = { method: opts.method, query, body: opts.body, headers: {} } as unknown as VercelRequest;
  return Promise.resolve(handler(req, res)).then(() => out);
}

beforeEach(async () => {
  h.db = await makeMigratedDb();
  h.email = null;
  h.sent = [];
});

const issue = async (email = 'friend@example.com', note = 'hello') => {
  h.email = OWNER;
  const r = await call({ method: 'POST', body: { email, note } });
  const [row] = await h.db.select().from(invites);
  return { response: r, row };
};

describe('who may do what', () => {
  it('a stranger cannot list invitations', async () => {
    expect((await call({ method: 'GET' })).status).toBe(401);
    h.email = 'stranger@example.com';
    expect((await call({ method: 'GET' })).status).toBe(403);
  });

  it('a stranger cannot issue, resend, revoke or restore one', async () => {
    h.email = 'stranger@example.com';
    const queries: Record<string, string>[] = [{}, { action: 'resend' }, { action: 'revoke' }, { action: 'restore' }];
    for (const query of queries) {
      const r = await call({ method: 'POST', query, body: { email: 'x@y.co', id: 'i' } });
      expect(r.status, JSON.stringify(query)).toBe(403);
    }
    expect((await h.db.select().from(invites)).length).toBe(0);
  });

  it('resolving a link needs NO session — that is the whole point', async () => {
    const { row } = await issue();
    h.email = null;
    const r = await call({ method: 'GET', query: { token: row.token } });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ state: 'valid' });
  });

  it('accepting needs a session', async () => {
    const { row } = await issue();
    h.email = null;
    expect((await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } })).status).toBe(401);
  });
});

describe('the boundary — what leaves the server', () => {
  it('THE OWNER LIST NEVER CARRIES A TOKEN', async () => {
    const { row } = await issue();
    h.email = OWNER;
    const r = await call({ method: 'GET' });
    const body = JSON.stringify(r.json);
    expect(body).not.toContain(row.token);
    // …and the control: the response is not empty, so the absence above is a
    // token that was stripped and not a list that was never rendered.
    expect(r.json).toHaveLength(1);
    expect(body).toContain('friend@example.com');
  });

  it('the create and resend responses carry no token either', async () => {
    const { response, row } = await issue();
    expect(JSON.stringify(response.json)).not.toContain(row.token);
    h.email = OWNER;
    const resent = await call({ method: 'POST', query: { action: 'resend' }, body: { id: row.id } });
    const [after] = await h.db.select().from(invites);
    expect(after.token).not.toBe(row.token); // it really did rotate
    expect(JSON.stringify(resent.json)).not.toContain(after.token);
  });

  it('the PUBLIC view carries neither the token nor the full address', async () => {
    const { row } = await issue();
    h.email = null;
    const body = JSON.stringify((await call({ method: 'GET', query: { token: row.token } })).json);
    expect(body).not.toContain(row.token);
    expect(body).not.toContain('friend@example.com');
    expect(body).toContain('example.com'); // the masked form did render
  });

  it('a resolved link is never cached — a shared proxy must not hand it to the next visitor', async () => {
    const { row } = await issue();
    h.email = null;
    const r = await call({ method: 'GET', query: { token: row.token } });
    expect(r.headers['Cache-Control']).toBe('no-store');
  });
});

describe('accepting', () => {
  it('the invited address gets in; a forwarded link does not', async () => {
    const { row } = await issue();

    h.email = 'someone.else@example.com';
    const wrong = await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } });
    expect(wrong.status).toBe(403);
    expect(wrong.json).toMatchObject({ ok: false, reason: 'mismatch' });
    expect(await roleForEmail(h.db, 'someone.else@example.com')).toBeNull();

    h.email = 'friend@example.com';
    const right = await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } });
    expect(right.status).toBe(200);
    expect(await roleForEmail(h.db, 'friend@example.com')).toBe('member');
  });

  it('a withdrawn invitation cannot be accepted, and says only "invalid"', async () => {
    const { row } = await issue();
    h.email = OWNER;
    await call({ method: 'POST', query: { action: 'revoke' }, body: { id: row.id } });
    h.email = 'friend@example.com';
    const r = await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } });
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ ok: false, reason: 'invalid' });
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();
  });
});

describe('removing a member', () => {
  it('revoking an accepted invite ends access AND kills their link; Restore brings them back', async () => {
    const { row } = await issue();
    h.email = 'friend@example.com';
    await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } });
    expect(await roleForEmail(h.db, 'friend@example.com')).toBe('member');

    h.email = OWNER;
    const del = await call({ method: 'POST', query: { action: 'revoke' }, body: { id: row.id } });
    expect(del.status).toBe(204);
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();

    // The discriminating case: the old link, already accepted, must not re-admit them.
    h.email = 'friend@example.com';
    const again = await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } });
    expect(again.json).toEqual({ ok: false, reason: 'invalid' });
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();

    // The owner's list shows it revoked, with acceptedAt kept (the UI's "removed").
    h.email = OWNER;
    const list = (await call({ method: 'GET' })).json as Array<{ status: string; acceptedAt: number | null }>;
    expect(list[0]).toMatchObject({ status: 'removed' });
    expect(list[0].acceptedAt).not.toBeNull();

    await call({ method: 'POST', query: { action: 'restore' }, body: { id: row.id } });
    expect(await roleForEmail(h.db, 'friend@example.com')).toBe('member');
  });
});

describe('re-inviting and resending', () => {
  it('re-inviting an active member answers 409 already-member, sends nothing, keeps access', async () => {
    const { row } = await issue();
    h.email = 'friend@example.com';
    await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } });
    h.sent = [];
    h.email = OWNER;
    const r = await call({ method: 'POST', body: { email: 'friend@example.com' } });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'already-member' });
    expect(h.sent).toEqual([]);
    expect(await roleForEmail(h.db, 'friend@example.com')).toBe('member');
  });

  it('re-inviting a removed member issues a fresh invitation', async () => {
    const { row } = await issue();
    h.email = 'friend@example.com';
    await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } });
    h.email = OWNER;
    await call({ method: 'POST', query: { action: 'revoke' }, body: { id: row.id } });
    const r = await call({ method: 'POST', body: { email: 'friend@example.com' } });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ status: 'invited' });
    expect(h.sent.length).toBe(2);
  });

  it('resend on a revoked row answers 409 revoked, sends nothing, changes nothing', async () => {
    const { row } = await issue();
    h.email = 'friend@example.com';
    await call({ method: 'POST', query: { action: 'accept' }, body: { token: row.token } });
    h.email = OWNER;
    await call({ method: 'POST', query: { action: 'revoke' }, body: { id: row.id } });
    h.sent = [];
    const [before] = await h.db.select().from(invites);
    const r = await call({ method: 'POST', query: { action: 'resend' }, body: { id: row.id } });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'revoked' });
    expect(h.sent).toEqual([]);
    expect((await h.db.select().from(invites))[0]).toEqual(before);
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();
  });
});

describe('routing', () => {
  it('there is no shares resource, and no resource at all answers 404', async () => {
    h.email = OWNER;
    for (const resource of ['shares', '']) {
      const r = await call({ method: 'GET', query: { resource } });
      expect(r.status, resource).toBe(404);
    }
  });
});

describe('issuing', () => {
  it('sends the link to the invited address, and records that it went', async () => {
    const { response, row } = await issue();
    expect(response.status).toBe(201);
    expect(h.sent).toEqual([{ to: 'friend@example.com', token: row.token }]);
    expect(row.emailStatus).toBe('sent');
    expect(response.json).toMatchObject({ status: 'invited', email: 'friend@example.com' });
  });

  it('refuses something that is not an address, and writes nothing', async () => {
    h.email = OWNER;
    const r = await call({ method: 'POST', body: { email: 'not-an-address' } });
    expect(r.status).toBe(400);
    expect((await h.db.select().from(invites)).length).toBe(0);
    expect(h.sent).toEqual([]);
  });

  it('lowercases the address, so one person cannot hold two invitations', async () => {
    h.email = OWNER;
    await call({ method: 'POST', body: { email: 'Friend@Example.com' } });
    await call({ method: 'POST', body: { email: 'FRIEND@EXAMPLE.COM' } });
    const rows = await h.db.select().from(invites);
    expect(rows.length).toBe(1);
    expect(rows[0].email).toBe('friend@example.com');
  });
});

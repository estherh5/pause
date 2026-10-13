import type { VercelRequest, VercelResponse } from '../lib/vercel.js';
import { one, readBody, requireOwner } from '../lib/api-helpers.js';
import { sessionEmail } from '../lib/session.js';
import { withFlare } from '../lib/flare-server.js';
import { sendAccountInvite } from '../lib/invite-email.js';
import {
  acceptInvite,
  createInvite,
  inviteByToken,
  isValidEmail,
  listInvites,
  normalizeEmail,
  resolveInviteView,
  restoreInvite,
  revokeInvite,
  revokeInviteForEmail,
  rotateToken,
  setEmailStatus,
  statusOf,
} from '../lib/invites.js';

/**
 * WHO MAY SAVE PLANS: invitations. An invitation becomes an account when the
 * person it names proves they hold that address (the accepted invite row is
 * what admits, see lib/admission.ts). One resource, `?resource=invites`, kept
 * in this one function to stay inside Vercel's Hobby function limit.
 */

/**
 * THE OWNER'S LIST NEVER CARRIES A TOKEN.
 *
 * A token is a bearer key: whoever holds it can claim the invitation. The admin
 * screen has no use for one — resend goes through the server — so it is dropped
 * here rather than being shipped to a browser, put in a React devtools tree, and
 * left in whatever proxy logs the response body.
 */
function toAdminRow(r: Awaited<ReturnType<typeof listInvites>>[number], now: number) {
  return {
    id: r.id,
    email: r.email,
    note: r.note,
    invitedBy: r.invitedBy,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    acceptedAt: r.acceptedAt,
    revokedAt: r.revokedAt,
    emailStatus: r.emailStatus,
    status: statusOf(r, now),
  };
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // `req.query` is always present under Vercel, but not under every test
  // harness; a handler that throws before deciding anything answers 500 to a
  // request that should have answered 405.
  if (one(req.query?.resource) === 'invites') return invites(req, res);
  res.status(404).json({ error: 'not-found' });
}

export default withFlare(handler);

/* ---- invitations -------------------------------------------------------- */

async function invites(req: VercelRequest, res: VercelResponse) {
  const now = Date.now();
  const action = one(req.query.action);

  // ---- PUBLIC: resolve a link. No session required — the whole point is that
  // a signed-out invitee can see what they were sent before signing in.
  if (req.method === 'GET' && req.query.token !== undefined) {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await resolveInviteView(one(req.query.token), now));
    return;
  }

  // ---- SIGNED IN: claim it. The token selects the invitation; the session
  // email is what admits. A forwarded link lands on `mismatch`.
  if (req.method === 'POST' && action === 'accept') {
    const email = await sessionEmail(req);
    if (!email) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const outcome = await acceptInvite(String(readBody(req).token ?? ''), email, now);
    res.status(outcome.ok ? 200 : 403).json(outcome);
    return;
  }

  // ---- Everything below is the owner's.
  const owner = await requireOwner(req, res);
  if (!owner) return;

  if (req.method === 'GET') {
    const rows = await listInvites();
    res.json(rows.map((r) => toAdminRow(r, now)));
    return;
  }

  if (req.method === 'POST' && !action) {
    const email = normalizeEmail(String(readBody(req).email ?? ''));
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    const rawNote = String(readBody(req).note ?? '').trim();
        const row = await createInvite({ email, note: rawNote || null, invitedBy: owner, now });
    const status = await sendAccountInvite(email, { token: row.token, note: row.note });
    await setEmailStatus(row.id, status);
    res.status(201).json({ ...toAdminRow({ ...row, emailStatus: status }, now) });
    return;
  }

  if (req.method === 'POST' && action === 'resend') {
    const id = String(readBody(req).id ?? '');
    // A resend ROTATES the token, so the previous link stops working. An
    // invitation that was forwarded by mistake is fixed by resending it.
    const row = await rotateToken(id, now);
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const status = await sendAccountInvite(row.email, { token: row.token, note: row.note });
    await setEmailStatus(row.id, status);
    res.json({ ...toAdminRow({ ...row, emailStatus: status }, now) });
    return;
  }

  if (req.method === 'POST' && (action === 'revoke' || action === 'restore')) {
    const id = String(readBody(req).id ?? '');
    if (action === 'revoke') await revokeInvite(id, now);
    else await restoreInvite(id, now);
    res.status(204).end();
    return;
  }

  res.status(405).end('Method Not Allowed');
}

/** Exported for the boundary test: nothing here may reach a client. */
export const __internal = { toAdminRow, inviteByToken };

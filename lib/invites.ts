import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { invites, type InviteRow } from '../db/schema.js';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Fourteen days. Long enough to survive a holiday, short enough that a link
 *  found in an old mailbox is dead. */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** 32 bytes of CSPRNG, base64url. Not a UUID: a token is a bearer secret and
 *  UUIDv4 carries only 122 bits with a recognisable shape. */
export function newInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What an invitation is, from the outside.
 *
 * `invalid` deliberately collapses NOT FOUND, REVOKED and EXPIRED into one
 * indistinguishable state. Separating them would turn the landing page into an
 * oracle: a stranger with a guessed token could learn that an address had once
 * been invited and then cut off, which is exactly the fact the revocation was
 * meant to bury.
 */
export type InviteState = 'valid' | 'invalid';

/** What the CLIENT is allowed to know. Never the row: the row carries the full
 *  address, and the landing page is reachable by anyone holding the link. */
export interface InviteView {
  state: InviteState;
  /** Present only when valid. */
  invitedBy?: string | null;
  note?: string | null;
  /** `f••••d@example.com` — enough for the right person to recognise
   *  themselves, not enough to harvest. */
  maskedEmail?: string;
}

/** Number of dots a mask always shows. FIXED, not proportional: a mask whose
 *  width tracked the local part would publish its length, and a length is most
 *  of what a guesser needs. */
const MASK = '••••';

/**
 * Mask the local part, keeping the first and last character when there is room.
 *
 * The masked form is for RECOGNITION, not secrecy from its owner: the invitee
 * has to be able to tell "yes, that is my address" while a stranger holding a
 * forwarded link learns nothing worth having. A local part of one or two
 * characters shows nothing at all — revealing the first of two is revealing
 * half the secret.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return MASK;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length < 3) return `${MASK}${domain}`;
  return `${local[0]}${MASK}${local[local.length - 1]}${domain}`;
}

/** True when this row admits nobody, whatever the token says. */
export function isDead(row: InviteRow, now: number): boolean {
  // Revoke is checked FIRST and is a hard deny: a revoked invitation is dead
  // even if it has not expired, and even if it was already accepted.
  if (row.revokedAt != null) return true;
  return row.expiresAt <= now;
}

export async function inviteByToken(token: string): Promise<InviteRow | null> {
  if (!token) return null;
  const [row] = await db.select().from(invites).where(eq(invites.token, token));
  return row ?? null;
}

export async function inviteByEmail(email: string): Promise<InviteRow | null> {
  const [row] = await db.select().from(invites).where(eq(invites.email, email.toLowerCase()));
  return row ?? null;
}

/** SERVER-SIDE ONLY. Resolves a token to what the landing page may show. */
export async function resolveInviteView(token: string, now: number): Promise<InviteView> {
  const row = await inviteByToken(token);
  if (!row || isDead(row, now)) return { state: 'invalid' };
  return {
    state: 'valid',
    invitedBy: row.invitedBy,
    note: row.note,
    maskedEmail: maskEmail(row.email),
  };
}

export type AcceptOutcome =
  | { ok: true; email: string }
  /** The link is dead, or was never real. */
  | { ok: false; reason: 'invalid' }
  /** The link is live but belongs to someone else. A FORWARDED LINK LANDS
   *  HERE, and grants nothing — the token selects, the email admits. */
  | { ok: false; reason: 'mismatch'; invited: string };

/**
 * Turn a live invitation into an account, for the signed-in visitor.
 *
 * Idempotent: accepting twice is the same as accepting once, because the second
 * call finds an already-accepted row that is still live and finds the same
 * accepted row. That matters — a double-click, a retried request and a re-opened link
 * are all normal.
 */
export async function acceptInvite(token: string, sessionEmail: string, now: number): Promise<AcceptOutcome> {
  const row = await inviteByToken(token);
  if (!row || isDead(row, now)) return { ok: false, reason: 'invalid' };

  const visitor = sessionEmail.toLowerCase();
  if (visitor !== row.email.toLowerCase()) {
    return { ok: false, reason: 'mismatch', invited: maskEmail(row.email) };
  }

  await db.update(invites).set({ acceptedAt: row.acceptedAt ?? now }).where(eq(invites.id, row.id));
  return { ok: true, email: row.email };
}

/** Owner-facing status, derived from the row rather than stored — a stored
 *  status is a second source of truth that drifts from the timestamps. */
export type InviteStatus = 'invited' | 'accepted' | 'expired' | 'revoked' | 'removed';

export function statusOf(row: InviteRow, now: number): InviteStatus {
  if (row.revokedAt != null) return row.acceptedAt != null ? 'removed' : 'revoked';
  // Accepted before expired: the invite row IS the account, and expiry only
  // limits the link, never a member who already used it.
  if (row.acceptedAt != null) return 'accepted';
  if (row.expiresAt <= now) return 'expired';
  return 'invited';
}

export async function listInvites(): Promise<InviteRow[]> {
  return db.select().from(invites).orderBy(desc(invites.createdAt));
}

export async function createInvite(opts: {
  email: string;
  note: string | null;
  invitedBy: string;
  now: number;
}): Promise<InviteRow | 'already-member'> {
  const email = opts.email.toLowerCase();
  // The invite row IS the account: re-inviting an active member would reset
  // acceptedAt and silently remove them, so it is refused instead.
  const existing = await inviteByEmail(email);
  if (existing && existing.acceptedAt != null && existing.revokedAt == null) return 'already-member';
  const token = newInviteToken();
  const values = {
    id: randomUUID(),
    email,
    token,
    invitedBy: opts.invitedBy,
    note: opts.note,
    createdAt: opts.now,
    expiresAt: opts.now + INVITE_TTL_MS,
    acceptedAt: null,
    revokedAt: null,
    emailStatus: null,
  };
  // Re-inviting an address REPLACES its invitation rather than failing on the
  // unique index: a fresh token, a fresh expiry, and any previous revocation
  // lifted. Without this, revoking someone would permanently bar re-inviting
  // them, which is not what "revoke" means.
  const [row] = await db
    .insert(invites)
    .values(values)
    .onConflictDoUpdate({ target: invites.email, set: { ...values, id: undefined } })
    .returning();
  return row;
}

/** A fresh token for the same invitation, so a resend supersedes the old link. */
export async function rotateToken(id: string, now: number): Promise<InviteRow | null | 'revoked'> {
  // A revoked row (withdrawn invite or removed member) never comes back by
  // resend: Restore is the only way back.
  const [prior] = await db.select().from(invites).where(eq(invites.id, id));
  if (!prior) return null;
  if (prior.revokedAt != null) return 'revoked';
  const [row] = await db
    .update(invites)
    .set({ token: newInviteToken(), expiresAt: now + INVITE_TTL_MS })
    .where(and(eq(invites.id, id), isNull(invites.revokedAt)))
    .returning();
  return row ?? 'revoked';
}

export async function revokeInvite(id: string, now: number): Promise<void> {
  await db.update(invites).set({ revokedAt: now }).where(eq(invites.id, id));
}

/**
 * Revoke whatever invitation names this address. The accepted invite is the
 * account, so this is how a person is removed by address. Leaves an
 * already-revoked row's timestamp alone.
 */
export async function revokeInviteForEmail(email: string, now: number): Promise<void> {
  await db
    .update(invites)
    .set({ revokedAt: now })
    .where(and(eq(invites.email, email.toLowerCase()), isNull(invites.revokedAt)));
}

/** Lift a revocation AND give the link a fresh life — a restored invitation
 *  whose expiry had already passed would otherwise read as restored while
 *  admitting nobody.
 *
 *  An invitation that had been ACCEPTED is a removed member; clearing its
 *  `revokedAt` is all it takes to bring them back, because admission reads the
 *  invite row itself (lib/admission.ts). */
export async function restoreInvite(id: string, now: number): Promise<void> {
  await db.update(invites).set({ revokedAt: null, expiresAt: now + INVITE_TTL_MS }).where(eq(invites.id, id));
}

export async function setEmailStatus(id: string, status: string): Promise<void> {
  await db.update(invites).set({ emailStatus: status }).where(eq(invites.id, id));
}

/** Pending, live invitations — used only by the owner's list badge. */
export async function pendingCount(now: number): Promise<number> {
  const rows = await db.select().from(invites).where(and(isNull(invites.revokedAt), isNull(invites.acceptedAt)));
  return rows.filter((r) => r.expiresAt > now).length;
}

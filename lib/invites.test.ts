import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { invites } from '../db/schema.js';

// `lib/invites.ts` imports the singleton `db`, so the module is swapped for a migrated in-memory one. `vi.hoisted` because the
// mock factory is lifted above the imports.
const h = vi.hoisted(() => ({ db: null as unknown as Awaited<ReturnType<typeof import('../test/db-from-migrations.js').makeMigratedDb>> }));
vi.mock('../db/index.js', () => ({ get db() { return h.db; } }));

const {
  acceptInvite,
  createInvite,
  INVITE_TTL_MS,
  isDead,
  maskEmail,
  newInviteToken,
  resolveInviteView,
  restoreInvite,
  revokeInvite,
  revokeInviteForEmail,
  rotateToken,
  statusOf,
} = await import('./invites.js');
const { roleForEmail } = await import('./admission.js');

const NOW = 1_800_000_000_000;
const OWNER = 'hoffman.esther@gmail.com';

beforeEach(async () => {
  h.db = await makeMigratedDb();
});

const issue = (over: Partial<{ email: string; note: string | null; now: number }> = {}) =>
  createInvite({ email: over.email ?? 'Friend@Example.com', note: over.note ?? 'come read the rye one', invitedBy: OWNER, now: over.now ?? NOW });

describe('tokens', () => {
  it('are 256 bits of CSPRNG, not a UUID', () => {
    const t = newInviteToken();
    // base64url of 32 bytes is 43 chars, and carries no dashes or padding.
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t).not.toMatch(/-{1}[0-9a-f]{4}-/); // not a UUID shape
  });

  it('never repeat across a large draw', () => {
    const seen = new Set(Array.from({ length: 2000 }, newInviteToken));
    expect(seen.size).toBe(2000);
  });
});

describe('maskEmail', () => {
  it('keeps enough for the right person to recognise themselves and no more', () => {
    expect(maskEmail('friend@example.com')).toBe('f••••d@example.com');
    // Under three characters, nothing is shown: revealing the first of two is
    // revealing half of it.
    expect(maskEmail('jo@example.com')).toBe('••••@example.com');
    expect(maskEmail('a@b.co')).toBe('••••@b.co');
  });

  it('never leaks the whole local part, however long', () => {
    const long = 'averyverylongaddressindeed@example.com';
    const masked = maskEmail(long);
    expect(masked).not.toContain('averyverylongaddressindeed');
    // The mask does not grow with the secret — a 26-character local part and a
    // 7-character one produce the same number of dots, so the length is not
    // readable off the page either.
    expect(maskEmail('seventy@example.com').match(/•/g)?.length).toBe(masked.match(/•/g)?.length);
    expect(masked.match(/•/g)?.length).toBe(4);
  });

  it('does not throw on something that is not an address', () => {
    expect(maskEmail('nonsense')).toBe('••••');
  });
});

describe('the gate', () => {
  it('a live invitation resolves to a view — and the view is NOT the row', async () => {
    const row = await issue();
    const view = await resolveInviteView(row.token, NOW);
    expect(view.state).toBe('valid');
    expect(view.note).toBe('come read the rye one');
    expect(view.maskedEmail).toBe('f••••d@example.com');
    // The two facts that must never travel: the full address and the token.
    expect(JSON.stringify(view)).not.toContain('friend@example.com');
    expect(JSON.stringify(view)).not.toContain(row.token);
  });

  it('REVOKED is a hard deny, reached before expiry — a live-but-withdrawn link is dead', async () => {
    const row = await issue();
    await revokeInvite(row.id, NOW);
    // Still inside its TTL: only the revocation can be denying it.
    expect(row.expiresAt).toBeGreaterThan(NOW);
    expect(await resolveInviteView(row.token, NOW)).toEqual({ state: 'invalid' });
    expect(await acceptInvite(row.token, 'friend@example.com', NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('an expired invitation is dead even though it was never revoked', async () => {
    const row = await issue();
    const after = row.expiresAt + 1;
    expect(row.revokedAt).toBeNull();
    expect(await resolveInviteView(row.token, after)).toEqual({ state: 'invalid' });
  });

  it('not-found, revoked and expired are INDISTINGUISHABLE', async () => {
    const live = await issue({ email: 'a@example.com' });
    const revoked = await issue({ email: 'b@example.com' });
    await revokeInvite(revoked.id, NOW);
    const expired = await issue({ email: 'c@example.com' });

    const notFound = await resolveInviteView('a-token-that-was-never-issued', NOW);
    const wasRevoked = await resolveInviteView(revoked.token, NOW);
    const wasExpired = await resolveInviteView(expired.token, expired.expiresAt + 1);

    // Byte-identical: nothing about which of the three happened can be read
    // off the response, so a guessed token is not an oracle.
    expect(JSON.stringify(wasRevoked)).toBe(JSON.stringify(notFound));
    expect(JSON.stringify(wasExpired)).toBe(JSON.stringify(notFound));
    // …and the control: a live one really does differ, so the equality above
    // is not just "everything returns the same thing".
    expect(JSON.stringify(await resolveInviteView(live.token, NOW))).not.toBe(JSON.stringify(notFound));
  });

  it('THE TOKEN SELECTS, THE EMAIL ADMITS — a forwarded link grants nothing', async () => {
    const row = await issue();
    const outcome = await acceptInvite(row.token, 'someone.else@example.com', NOW);
    expect(outcome).toEqual({ ok: false, reason: 'mismatch', invited: 'f••••d@example.com' });
    // The decisive fact: the wrong visitor did NOT become a viewer.
    expect(await roleForEmail(h.db, 'someone.else@example.com')).toBeNull();
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();
  });

  it('the invited address is admitted, case-insensitively, and the accepted invite is the account', async () => {
    const row = await issue();
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();
    const outcome = await acceptInvite(row.token, 'FRIEND@Example.COM', NOW);
    expect(outcome).toEqual({ ok: true, email: 'friend@example.com' });
    expect(await roleForEmail(h.db, 'friend@example.com')).toBe('member');
    const [inv] = await h.db.select().from(invites);
    expect(inv.invitedBy).toBe(OWNER);
    expect(inv.acceptedAt).toBe(NOW);
  });

  it('accepting twice is the same as accepting once', async () => {
    const row = await issue();
    await acceptInvite(row.token, 'friend@example.com', NOW);
    const second = await acceptInvite(row.token, 'friend@example.com', NOW + 5_000);
    expect(second).toEqual({ ok: true, email: 'friend@example.com' });
    expect((await h.db.select().from(invites)).length).toBe(1);
    // The first acceptance's timestamp is what stands: an idempotent replay is
    // not a new event.
    const [inv] = await h.db.select().from(invites);
    expect(inv.acceptedAt).toBe(NOW);
  });

  it('revokeInvite on an accepted member removes them: revoked is a hard deny', async () => {
    // pause has no share list; the accepted invite IS the account, so revoking
    // it is how a person is removed.
    const row = await issue();
    await acceptInvite(row.token, 'friend@example.com', NOW);
    expect(await roleForEmail(h.db, 'friend@example.com')).toBe('member');
    await revokeInvite(row.id, NOW + 1);
    expect(await resolveInviteView(row.token, NOW + 2)).toEqual({ state: 'invalid' });
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();
  });

  it('a revoked accepted link no longer re-admits them', async () => {
    const row = await issue();
    await acceptInvite(row.token, 'friend@example.com', NOW);
    await revokeInviteForEmail('Friend@Example.com', NOW + 1);
    expect(await acceptInvite(row.token, 'friend@example.com', NOW + 2)).toEqual({ ok: false, reason: 'invalid' });
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();
  });

  it('revokeInviteForEmail leaves an already-revoked row\'s timestamp alone', async () => {
    const row = await issue();
    await revokeInvite(row.id, NOW + 1);
    await revokeInviteForEmail('friend@example.com', NOW + 99);
    const [inv] = await h.db.select().from(invites);
    expect(inv.revokedAt).toBe(NOW + 1);
  });

  it('Restore on a REMOVED member (accepted, then revoked) re-admits them', async () => {
    const row = await issue();
    await acceptInvite(row.token, 'friend@example.com', NOW);
    await revokeInviteForEmail('friend@example.com', NOW + 1);
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();
    await restoreInvite(row.id, NOW + 2);
    expect(await roleForEmail(h.db, 'friend@example.com')).toBe('member');
    const [inv] = await h.db.select().from(invites);
    expect(statusOf(inv, NOW + 3)).toBe('accepted');
  });

  it('Restore on a never-accepted invitation grants nothing until it is accepted', async () => {
    const row = await issue();
    await revokeInvite(row.id, NOW + 1);
    await restoreInvite(row.id, NOW + 2);
    expect(await roleForEmail(h.db, 'friend@example.com')).toBeNull();
    const [inv] = await h.db.select().from(invites);
    expect(statusOf(inv, NOW + 3)).toBe('pending');
  });
});

describe('issuing and re-issuing', () => {
  it('expiry is computed WITH creation, never defaulted apart from it', async () => {
    const row = await issue();
    expect(row.expiresAt - row.createdAt).toBe(INVITE_TTL_MS);
  });

  it('re-inviting a revoked address lifts the revocation and mints a new token', async () => {
    const first = await issue();
    await revokeInvite(first.id, NOW);
    const second = await issue({ now: NOW + 60_000 });
    expect(second.token).not.toBe(first.token);
    expect(second.revokedAt).toBeNull();
    // One row per address, not two — the unique index is the point.
    expect((await h.db.select().from(invites)).length).toBe(1);
    expect(await resolveInviteView(second.token, NOW + 60_000)).toMatchObject({ state: 'valid' });
    // …and the OLD link stays dead, or a withdrawal would be undone by a resend.
    expect(await resolveInviteView(first.token, NOW + 60_000)).toEqual({ state: 'invalid' });
  });

  it('a resend supersedes the previous link', async () => {
    const row = await issue();
    const rotated = await rotateToken(row.id, NOW + 1000);
    expect(rotated!.token).not.toBe(row.token);
    expect(await resolveInviteView(row.token, NOW + 1000)).toEqual({ state: 'invalid' });
    expect(await resolveInviteView(rotated!.token, NOW + 1000)).toMatchObject({ state: 'valid' });
  });

  it('restoring a revoked-AND-expired invitation gives it a real life again', async () => {
    const row = await issue();
    await revokeInvite(row.id, NOW);
    const late = row.expiresAt + 1_000;
    await restoreInvite(row.id, late);
    // Without the fresh expiry this would read as restored while admitting
    // nobody — the failure the restore is written to avoid.
    expect(await resolveInviteView(row.token, late)).toMatchObject({ state: 'valid' });
  });
});

describe('statusOf', () => {
  const base = { id: 'i', email: 'a@b.co', token: 't', invitedBy: null, note: null, createdAt: NOW, expiresAt: NOW + 1000, acceptedAt: null, revokedAt: null, emailStatus: null };
  it('reads revoked before expired before accepted', () => {
    expect(statusOf({ ...base, revokedAt: NOW, expiresAt: NOW - 1, acceptedAt: NOW }, NOW)).toBe('revoked');
    expect(statusOf({ ...base, expiresAt: NOW - 1, acceptedAt: NOW }, NOW)).toBe('expired');
    expect(statusOf({ ...base, acceptedAt: NOW }, NOW)).toBe('accepted');
    expect(statusOf(base, NOW)).toBe('pending');
  });
  it('agrees with isDead about who is dead', () => {
    for (const row of [
      { ...base, revokedAt: NOW },
      { ...base, expiresAt: NOW },
      { ...base, expiresAt: NOW - 1 },
    ]) {
      expect(isDead(row, NOW)).toBe(true);
      expect(['revoked', 'expired']).toContain(statusOf(row, NOW));
    }
    expect(isDead(base, NOW)).toBe(false);
  });
});

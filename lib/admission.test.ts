import { describe, it, expect, beforeEach } from 'vitest';
import { makeMigratedDb } from '../test/db-from-migrations.js';
import { invites } from '../db/schema.js';
import { DEFAULT_OPEN, roleForEmail } from './admission.js';

let db: Awaited<ReturnType<typeof makeMigratedDb>>;
const invite = (email: string, extra: Partial<typeof invites.$inferInsert> = {}) =>
  db.insert(invites).values({ id: email, email, token: `t-${email}`, createdAt: 1, expiresAt: 2, ...extra });

beforeEach(async () => { db = await makeMigratedDb(); delete process.env.OWNER_EMAIL; });

describe('roleForEmail: owner → invite row → (no users table) → baseline', () => {
  it('owner by default address, case-insensitive', async () => {
    expect(await roleForEmail(db, 'Hoffman.Esther@Gmail.com')).toBe('owner');
  });
  it('accepted, unrevoked invite → member', async () => {
    await invite('friend@example.com', { acceptedAt: 5 });
    expect(await roleForEmail(db, 'FRIEND@example.com')).toBe('member');
  });
  it('pending invite → null (accepting is what admits)', async () => {
    await invite('friend@example.com');
    expect(await roleForEmail(db, 'friend@example.com')).toBeNull();
  });
  it('revoked after acceptance → null (hard deny before the baseline)', async () => {
    await invite('friend@example.com', { acceptedAt: 5, revokedAt: 6 });
    expect(await roleForEmail(db, 'friend@example.com')).toBeNull();
  });
  it('no invite → null, because the baseline is closed', async () => {
    expect(DEFAULT_OPEN).toBe(false);
    expect(await roleForEmail(db, 'stranger@example.com')).toBeNull();
  });
  it('null email → null', async () => {
    expect(await roleForEmail(db, null)).toBeNull();
  });
});

import { eq } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { invites } from '../db/schema.js';

export type Role = 'owner' | 'member';

/** Saved plans are invite-only (spec D1). A module constant, never an env var,
 *  and nothing (not the owner check) may widen it. */
export const DEFAULT_OPEN = false;

export const ownerEmail = (): string => (process.env.OWNER_EMAIL || 'hoffman.esther@gmail.com').trim().toLowerCase();

/**
 * Gate order: owner → invite row → (users row) → baseline.
 * There is no users table: an accepted invite IS the account, so the
 * grandfathering clause is deliberately absent (DESIGN.md "Where an app has no
 * users table"). A revoked invite is a hard deny reached BEFORE the baseline,
 * so Remove keeps working even if the baseline is ever opened.
 */
export async function roleForEmail(db: DB, email: string | null): Promise<Role | null> {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  if (e === ownerEmail()) return 'owner';
  const [row] = await db.select().from(invites).where(eq(invites.email, e)).limit(1);
  if (row?.revokedAt != null) return null;
  if (row?.acceptedAt != null) return 'member';
  return DEFAULT_OPEN ? 'member' : null;
}

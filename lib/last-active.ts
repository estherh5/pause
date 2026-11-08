import { isNull, lt, or, sql } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { users } from '../db/schema.js';
import type { SessionUser } from './session-jwt.js';

/**
 * `users.last_active_at` — THE LAST TIME THIS PERSON MADE AN AUTHENTICATED
 * REQUEST TO PAUSE.
 *
 * flare aggregates this across the fleet's roster apps (flare/lib/roster-schema.ts
 * is the contract and states the definition). It is one meaning in every app,
 * so what is written here is a REQUEST, never a proxy for one.
 *
 * Only ADMITTED people are recorded: the caller stamps after
 * lib/admission.ts#roleForEmail returns a role, so a signed-in guest who was
 * never invited leaves no row.
 */

/** How stale the stored stamp must be before another write is allowed. An hour
 *  is the resolution flare displays. Exported so the test steps the clock by
 *  exactly this much rather than a hardcoded copy. */
export const LAST_ACTIVE_THROTTLE_MS = 60 * 60 * 1000;

/**
 * ONE CONDITIONAL UPSERT. Not a read-then-write.
 *
 * tide's users already exist (Auth.js creates them), so it needs only a
 * conditional UPDATE. pause's rows are created here, on a person's first
 * admitted request, so the statement is an INSERT whose conflict arm is tide's
 * conditional UPDATE: the throttle lives in `setWhere`, and on the other 99% of
 * requests the conflict arm matches nothing and no row changes. Two concurrent
 * requests cannot both write, because the database decides.
 *
 * `created_at` is set only by the INSERT arm, so it is the first admitted visit
 * and never moves. `name` follows the session's current name on each hourly
 * write, keeping the stored one when the session has none.
 */
export async function touchLastActive(db: DB, user: SessionUser, now: number): Promise<void> {
  const email = user.email.trim().toLowerCase();
  await db
    .insert(users)
    .values({ email, name: user.name, createdAt: now, lastActiveAt: now })
    .onConflictDoUpdate({
      target: users.email,
      set: { lastActiveAt: now, name: sql`coalesce(excluded.name, ${users.name})` },
      // `isNull` is its own arm: `last_active_at < x` is NULL, not true, for a
      // NULL stamp, so the comparison alone would never stamp that row.
      setWhere: or(isNull(users.lastActiveAt), lt(users.lastActiveAt, now - LAST_ACTIVE_THROTTLE_MS)),
    });
}

/**
 * The stamp as the request path calls it: a failure is logged and swallowed.
 * This is a courtesy for another app's dashboard, so a database hiccup while
 * writing it must never turn into a failed request here. Never throws.
 */
export async function recordActive(db: DB, user: SessionUser, now: number = Date.now()): Promise<void> {
  try {
    await touchLastActive(db, user, now);
  } catch (err) {
    console.error('last-active stamp failed', err instanceof Error ? err.name : 'unknown');
  }
}

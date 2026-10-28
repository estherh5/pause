import type { InviteRow } from '../db/schema.js';

/** Owner-facing status, derived from the row rather than stored — a stored
 *  status is a second source of truth that drifts from the timestamps.
 *  Its own module, free of the db client, so the owner's InviteRow can be
 *  tested against the server's real output rather than a hand-typed status. */
export type InviteStatus = 'invited' | 'accepted' | 'expired' | 'revoked' | 'removed';

export const INVITE_STATUSES: readonly InviteStatus[] = ['invited', 'accepted', 'expired', 'revoked', 'removed'];

export function statusOf(
  row: Pick<InviteRow, 'revokedAt' | 'acceptedAt' | 'expiresAt'>,
  now: number,
): InviteStatus {
  if (row.revokedAt != null) return row.acceptedAt != null ? 'removed' : 'revoked';
  // Accepted before expired: the invite row IS the account, and expiry only
  // limits the link, never a member who already used it.
  if (row.acceptedAt != null) return 'accepted';
  if (row.expiresAt <= now) return 'expired';
  return 'invited';
}

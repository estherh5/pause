import type { DB } from '../db/index.js';
import { users } from '../db/schema.js';

/** flare/lib/roster-schema.ts#RosterUser, verbatim. */
export type RosterUser = {
  externalId: string;
  email: string;
  name: string | null;
  signedUpAt: number | null;
  lastSeenAt: number | null;
};

/**
 * Hourly push of pause's admitted people to flare's fleet-wide `/people` view
 * (`POST /api/ingest/users`). The contract is flare/lib/roster-schema.ts; this
 * builds exactly its payload, same endpoint and headers as tide's
 * lib/flare-roster.ts.
 *
 * `externalId` is the lowercased email. It is the `users` primary key and
 * pause's only per-person identity (sign-in is the shared crystalprism session,
 * admission is by email), so it is as stable as the account itself.
 *
 * EVERY TIMESTAMP LEAVES AS A NUMBER: both columns are raw epoch-ms integers,
 * and flare drops a non-number to null without complaint.
 */
export function rosterPayload(rows: (typeof users.$inferSelect)[]): { users: RosterUser[]; skippedCount: number } {
  const valid = rows.filter((r) => r.email && r.email.trim() !== '');
  return {
    users: valid.map((r) => ({
      externalId: r.email,
      email: r.email,
      name: r.name ?? null,
      signedUpAt: r.createdAt,
      // `?? null` so the key is always present: a number or null, never omitted.
      lastSeenAt: r.lastActiveAt ?? null,
    })),
    skippedCount: rows.length - valid.length,
  };
}

/** Never throws on a missing FLARE_URL or a non-2xx; logs instead. */
export async function pushRoster(db: DB): Promise<void> {
  // FLARE_URL is endpoint-shaped fleet-wide (lib/flare-server.ts posts errors
  // to it directly); `.origin` reduces it to the host `/api/ingest/users` needs.
  if (!process.env.FLARE_URL) {
    console.error('flare roster push skipped: FLARE_URL is not set');
    return;
  }
  const origin = new URL(process.env.FLARE_URL).origin;
  const rows = await db.select().from(users);
  const res = await fetch(`${origin}/api/ingest/users`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-flare-roster-key': process.env.FLARE_ROSTER_KEY ?? '',
    },
    body: JSON.stringify(rosterPayload(rows)),
  });
  if (!res.ok) console.error(`flare roster push failed: ${res.status}`);
}

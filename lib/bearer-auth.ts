import { timingSafeEqual } from 'node:crypto';

/** Constant-time once lengths match; a length mismatch reveals only "not equal". */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Same check as tide's lib/bearer-auth.ts. An unset, empty or whitespace-only
 *  secret FAILS CLOSED: "no secret configured" must never read as "no auth
 *  required". `.trim()` because `" "` is truthy. */
export function bearerAuthorized(header: string | string[] | undefined, secret: string | undefined): boolean {
  if (!secret?.trim()) return false;
  if (typeof header !== 'string' || !header) return false;
  return safeCompare(header, `Bearer ${secret}`);
}

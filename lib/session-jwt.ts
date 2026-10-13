import { decode } from '@auth/core/jwt';
import { sessionCookieConfig } from './session-cookie.js';
import { revalidateRingSession } from './ring-session-check.js';

export interface SessionUser {
  email: string;
  name: string | null;
}

/** Decode the shared ring JWE cookie. Salt MUST be the cookie name and the
 *  secret the shared AUTH_SECRET, or the token won't cross-validate the ring. */
export async function decodeSessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const salt = sessionCookieConfig(process.env).name;
  try {
    const payload = await decode({ token, secret, salt });
    const email = payload?.email;
    if (!email || typeof email !== 'string') return null;
    // A password change on the auth service ends every ring session signed in
    // before it — see lib/ring-session-check.ts. pause only READS this
    // cookie (never re-stamps or clears it), so a revoked session is refused
    // on every read. Fails open, and never throws.
    if ((await revalidateRingSession(payload, Date.now())) === null) return null;
    const name = typeof payload?.name === 'string' ? payload.name : null;
    return { email, name };
  } catch {
    return null;
  }
}

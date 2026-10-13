import type { VercelRequest } from './vercel.js';
import { decodeSessionToken, type SessionUser } from './session-jwt.js';
import { sessionCookieConfig } from './session-cookie.js';

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/** The signed-in ring user, or null. Its own module so handler tests can mock identity alone. */
export async function sessionUser(req: VercelRequest): Promise<SessionUser | null> {
  return decodeSessionToken(readCookie(req.headers.cookie, sessionCookieConfig(process.env).name));
}

export async function sessionEmail(req: VercelRequest): Promise<string | null> {
  const u = await sessionUser(req);
  return u ? u.email.toLowerCase() : null;
}

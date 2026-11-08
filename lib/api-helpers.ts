import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercel.js';
import { db } from '../db/index.js';
import { sessionUser } from './session.js';
import { ownerEmail, roleForEmail, type Role } from './admission.js';
import { recordActive } from './last-active.js';
import type { SessionUser } from './session-jwt.js';

// Re-exported so modules copied from methods (api/feedback.ts) resolve unchanged.
export { sessionEmail } from './session.js';

export const uid = (): string => randomUUID();

export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

/** Parsed JSON body or {}. Vercel throws on reading a malformed JSON body. */
export function readBody(req: VercelRequest): Record<string, unknown> {
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  } catch {
    return {};
  }
}

/**
 * The signed-in person's role, recording the visit for flare's roster when
 * there is one. Every authenticated API request resolves its caller through
 * here (requireMember, requireOwner, api/me.ts), so this is the one place the
 * stamp lives. Only an admitted person is stamped; recordActive never throws.
 */
export async function admittedRole(user: SessionUser): Promise<Role | null> {
  const role = await roleForEmail(db, user.email);
  if (role) await recordActive(db, user);
  return role;
}

/** 401 signed out, 403 signed in without access; otherwise the member. */
export async function requireMember(req: VercelRequest, res: VercelResponse): Promise<{ email: string; role: Role } | null> {
  const user = await sessionUser(req);
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return null; }
  const role = await admittedRole(user);
  if (!role) { res.status(403).json({ error: 'no-access' }); return null; }
  return { email: user.email.toLowerCase(), role };
}

export async function requireOwner(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const user = await sessionUser(req);
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return null; }
  const email = user.email.toLowerCase();
  if (email !== ownerEmail()) { res.status(403).json({ error: 'forbidden' }); return null; }
  await recordActive(db, user);
  return email;
}

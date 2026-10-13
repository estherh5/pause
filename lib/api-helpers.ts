import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercel.js';
import { db } from '../db/index.js';
import { sessionEmail } from './session.js';
import { ownerEmail, roleForEmail, type Role } from './admission.js';

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

/** 401 signed out, 403 signed in without access; otherwise the member. */
export async function requireMember(req: VercelRequest, res: VercelResponse): Promise<{ email: string; role: Role } | null> {
  const email = await sessionEmail(req);
  if (!email) { res.status(401).json({ error: 'unauthorized' }); return null; }
  const role = await roleForEmail(db, email);
  if (!role) { res.status(403).json({ error: 'no-access' }); return null; }
  return { email, role };
}

export async function requireOwner(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const email = await sessionEmail(req);
  if (!email) { res.status(401).json({ error: 'unauthorized' }); return null; }
  if (email !== ownerEmail()) { res.status(403).json({ error: 'forbidden' }); return null; }
  return email;
}

import type { VercelRequest, VercelResponse } from '../lib/vercel.js';
import { db } from '../db/index.js';
import { sessionUser } from '../lib/session.js';
import { roleForEmail } from '../lib/admission.js';
import { withFlare } from '../lib/flare-server.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await sessionUser(req);
  if (!user) { res.json({ state: 'signed-out' }); return; }
  const role = await roleForEmail(db, user.email);
  if (!role) { res.json({ state: 'guest', email: user.email }); return; }
  res.json({ state: role, email: user.email, name: user.name });
}
export default withFlare(handler);

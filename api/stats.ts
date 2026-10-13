import type { VercelRequest, VercelResponse } from '../lib/vercel.js';
import { db } from '../db/index.js';
import { one, requireMember } from '../lib/api-helpers.js';
import { getPauseStats, isValidTimeZone } from '../lib/stats.js';
import { withFlare } from '../lib/flare-server.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  const who = await requireMember(req, res);
  if (!who) return;
  const timeZone = one(req.query?.tz);
  if (!isValidTimeZone(timeZone)) { res.status(400).json({ error: 'bad-time-zone' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.json(await getPauseStats(db, who.email, { now: Date.now(), timeZone }));
}
export default withFlare(handler);

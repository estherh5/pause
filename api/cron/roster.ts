import type { VercelRequest, VercelResponse } from '../../lib/vercel.js';
import { db } from '../../db/index.js';
import { bearerAuthorized } from '../../lib/bearer-auth.js';
import { pushRoster } from '../../lib/flare-roster.js';
import { withFlare } from '../../lib/flare-server.js';

/**
 * Hourly push of the admitted-people roster to flare (vercel.json cron, :43).
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; an unset or blank
 * secret rejects everything (lib/bearer-auth.ts).
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  if (!bearerAuthorized(req.headers.authorization, process.env.CRON_SECRET)) {
    // Bare 401: don't confirm whether a secret is configured, or echo what was sent.
    res.status(401).send('Unauthorized');
    return;
  }
  await pushRoster(db);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
}
export default withFlare(handler);

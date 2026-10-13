import type { VercelRequest, VercelResponse } from '../../lib/vercel.js';
import { db } from '../../db/index.js';
import { one, readBody } from '../../lib/api-helpers.js';
import { exceedsBodyCap, normalizePlanPayload, validatePlanPayload } from '../../lib/plan-payload.js';
import { createAnonymousPlan, readShare } from '../../lib/plans.js';
import { MAX_SHARE_ID_LENGTH } from '../../lib/share-id.js';
import { withFlare } from '../../lib/flare-server.js';
import type { PlanPayload } from '../../lib/types.js';

/**
 * The anonymous half, wire-compatible with pause_api (spec D5): same paths,
 * same 201-with-a-JSON-string, same plain-text errors. Signed-in guests use it
 * too. Every share link, legacy or saved, resolves through GET here.
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  const id = one(req.query?.id);
  if (req.method === 'GET' && id) {
    res.setHeader('Cache-Control', 'no-store');
    const view = id.length <= MAX_SHARE_ID_LENGTH ? await readShare(db, id) : null;
    if (!view) { res.status(404).send('Activities not found'); return; }
    res.json(view);
    return;
  }
  if (req.method === 'POST' && !id) {
    if (exceedsBodyCap(req)) { res.status(413).send('Request too large'); return; }
    const body = readBody(req);
    const error = validatePlanPayload(body);
    if (error) { res.status(400).send(error); return; }
    const out = await createAnonymousPlan(db, normalizePlanPayload(body as unknown as PlanPayload), Date.now());
    if ('error' in out) { res.status(429).send('Too many schedules created, try again later'); return; }
    res.status(201).json(out.shareId);
    return;
  }
  res.status(405).end();
}
export default withFlare(handler);

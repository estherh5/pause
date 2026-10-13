import type { VercelRequest, VercelResponse } from '../lib/vercel.js';
import { db } from '../db/index.js';
import { one, readBody, requireMember } from '../lib/api-helpers.js';
import { exceedsBodyCap, normalizePlanPayload, validatePlanPayload } from '../lib/plan-payload.js';
import { validatePlanName } from '../lib/plan-name.js';
import { createPlan, deletePlan, getPlan, listPlans, updatePlan } from '../lib/plans.js';
import { withFlare } from '../lib/flare-server.js';
import type { PlanPayload } from '../lib/types.js';

const NOT_FOUND = { error: 'not-found' } as const;

async function handler(req: VercelRequest, res: VercelResponse) {
  const who = await requireMember(req, res);
  if (!who) return;
  res.setHeader('Cache-Control', 'no-store');
  const id = one(req.query?.id);
  const now = Date.now();

  if (!id) {
    if (req.method === 'GET') { res.json(await listPlans(db, who.email)); return; }
    if (req.method === 'POST') {
      if (exceedsBodyCap(req)) { res.status(413).json({ error: 'too-large' }); return; }
      const body = readBody(req);
      const name = validatePlanName(body.name);
      if (!name.ok) { res.status(400).json({ error: name.error }); return; }
      const bad = validatePlanPayload(body.plan);
      if (bad) { res.status(400).json({ error: bad }); return; }
      const out = await createPlan(db, who.email, name, normalizePlanPayload(body.plan as PlanPayload), now);
      if ('error' in out) { res.status(409).json(out); return; }
      res.status(201).json(out);
      return;
    }
    res.status(405).end();
    return;
  }

  if (req.method === 'GET') {
    const p = await getPlan(db, who.email, id);
    if (!p) { res.status(404).json(NOT_FOUND); return; }
    res.json(p);
    return;
  }
  if (req.method === 'PATCH') {
    if (exceedsBodyCap(req)) { res.status(413).json({ error: 'too-large' }); return; }
    const body = readBody(req);
    if (body.name === undefined && body.plan === undefined) { res.status(400).json({ error: 'Nothing to change.' }); return; }
    const patch: Parameters<typeof updatePlan>[3] = {};
    if (body.name !== undefined) {
      const name = validatePlanName(body.name);
      if (!name.ok) { res.status(400).json({ error: name.error }); return; }
      patch.name = name;
    }
    if (body.plan !== undefined) {
      const bad = validatePlanPayload(body.plan);
      if (bad) { res.status(400).json({ error: bad }); return; }
      patch.payload = normalizePlanPayload(body.plan as PlanPayload);
    }
    const out = await updatePlan(db, who.email, id, patch, now);
    if (out === null) { res.status(404).json(NOT_FOUND); return; }
    if ('error' in out) { res.status(409).json(out); return; }
    res.json(out);
    return;
  }
  if (req.method === 'DELETE') {
    if (!(await deletePlan(db, who.email, id))) { res.status(404).json(NOT_FOUND); return; }
    res.status(204).end();
    return;
  }
  res.status(405).end();
}
export default withFlare(handler);

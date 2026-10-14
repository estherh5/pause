import type { VercelRequest, VercelResponse } from '../lib/vercel.js';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { feedback } from '../db/schema.js';
import { one, readBody, requireMember, requireOwner, uid } from '../lib/api-helpers.js';
import { withFlare } from '../lib/flare-server.js';
import { appendAdminReply, FeedbackReplyValidationError, listThreadsFor, stripEmailTelemetry } from '../lib/feedback.js';
import { makeFeedbackReplySender } from '../lib/feedback-email.js';

const TYPES = ['bug', 'idea', 'other'];
const MAX_MESSAGE = 5000;
const STATUSES = ['new', 'in-progress', 'addressed', 'declined'];

async function handler(req: VercelRequest, res: VercelResponse) {
  const id = one(req.query?.id) || undefined;

  if (id) {
    if (!(await requireOwner(req, res))) return;

    if (req.method === 'PATCH') {
      // Status-only now — the legacy `response` column is retained but no
      // longer written; replies are a separate action (POST ?action=reply).
      const body = readBody(req);
      if (!STATUSES.includes(String(body.status))) {
        res.status(400).json({ error: 'Invalid status.' });
        return;
      }
      const [row] = await db
        .update(feedback)
        .set({ status: String(body.status), updatedAt: new Date().toISOString() })
        .where(eq(feedback.id, id))
        .returning();
      if (!row) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json(row);
      return;
    }

    if (req.method === 'POST' && one(req.query?.action) === 'reply') {
      const [row] = await db.select().from(feedback).where(eq(feedback.id, id)).limit(1);
      if (!row) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const body = readBody(req);
      try {
        const message = await appendAdminReply(db, makeFeedbackReplySender(), {
          feedback: row,
          body: String(body.body ?? ''),
        });
        res.status(201).json(message);
      } catch (err) {
        if (err instanceof FeedbackReplyValidationError) {
          res.status(400).json({ error: err.message });
          return;
        }
        console.error('[feedback] reply failed:', err);
        res.status(500).json({ error: "Couldn't send the reply." });
      }
      return;
    }

    res.status(405).end('Method Not Allowed');
    return;
  }

  if (req.method === 'GET') {
    if (one(req.query?.mine) === '1') {
      // Read-only "My submissions" view: any signed-in owner/viewer sees
      // their own thread, with email-delivery telemetry stripped
      // server-side — the key never reaches this response's JSON.
      const who = await requireMember(req, res);
      if (!who) return;
      const email = who.email;
      const rows = await db
        .select()
        .from(feedback)
        .where(sql`lower(${feedback.userEmail}) = ${email}`)
        .orderBy(desc(feedback.createdAt));
      const threads = await listThreadsFor(
        db,
        rows.map((r) => r.id),
      );
      res.json(rows.map((r) => ({ ...r, messages: (threads.get(r.id) ?? []).map(stripEmailTelemetry) })));
      return;
    }

    // Admin triage list, newest first, full thread incl. delivery marks.
    if (!(await requireOwner(req, res))) return;
    const rows = await db.select().from(feedback).orderBy(desc(feedback.createdAt));
    const threads = await listThreadsFor(
      db,
      rows.map((r) => r.id),
    );
    res.json(rows.map((r) => ({ ...r, messages: threads.get(r.id) ?? [] })));
    return;
  }

  if (req.method === 'POST') {
    const who = await requireMember(req, res);
    if (!who) return;
    const body = readBody(req);
    const type = TYPES.includes(String(body.type)) ? String(body.type) : 'other';
    const message = String(body.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Enter a message.' });
      return;
    }
    if (message.length > MAX_MESSAGE) {
      res.status(400).json({ error: `Message must be ${MAX_MESSAGE} characters or fewer.` });
      return;
    }
    const email = who.email;
    const notify = body.notify === true;
    const [row] = await db
      .insert(feedback)
      .values({
        id: uid(),
        userEmail: email,
        notify,
        type,
        message,
        pageUrl: String(body.pageUrl ?? '').trim() || null,
        userAgent: req.headers['user-agent'] ?? null,
        createdAt: new Date().toISOString(),
      })
      .returning();
    res.status(201).json(row);
    return;
  }

  res.status(405).end('Method Not Allowed');
}

export default withFlare(handler);

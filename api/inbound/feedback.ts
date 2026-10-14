import type { IncomingMessage } from 'node:http';
import type { VercelRequest, VercelResponse } from '../../lib/vercel.js';
import { db } from '../../db/index.js';
import { processInboundEmail, fetchInboundEmail, type ReceivedEmailData } from '../../lib/resend-inbound.js';
import { sendInboundReplyNotification } from '../../lib/feedback-email.js';
import { verifySvixSignature } from '../../lib/svix-verify.js';
import { reportServerError, withFlare } from '../../lib/flare-server.js';

/**
 * The request's exact bytes, read once from the stream. Svix signs the raw
 * body, so it must be verified BEFORE any parse — and never via `req.body`,
 * which on Vercel's Node runtime is a lazy getter that JSON-parses (and
 * throws on bad JSON). Vercel's helpers buffer the body before the handler
 * runs and replay it through `req.on('data' | 'end')` (@vercel/node
 * `restoreBody`), which is why this listens for those two events rather than
 * async-iterating the stream: the replay patches `on`, not `'readable'`.
 */
export function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer | string) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const header = (req: VercelRequest, name: string): string | null => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? null;
};

/**
 * Resend's `email.received` webhook for the shared crystalprism.io inbox
 * (https://pause.crystalprism.io/api/inbound/feedback). Contract: the
 * "Inbound replies close the loop" bullet of ~/Developer/DESIGN.md; giftme's
 * route is the reference this ports.
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
    return;
  }

  const secret = process.env.FEEDBACK_REPLY_SECRET;
  if (!secret) {
    console.error('[inbound] FEEDBACK_REPLY_SECRET not set');
    res.status(500).json({ ok: false, error: 'not configured' });
    return;
  }
  // Read the raw body once — Svix signs the exact bytes, so we verify before parsing.
  const rawBody = await readRawBody(req);

  // Verify the webhook genuinely came from Resend. On the production deployment
  // an unset (or Sensitive-pulled-as-empty) RESEND_WEBHOOK_SECRET fails CLOSED:
  // this endpoint writes feedback messages, so unsigned posts are refused rather
  // than trusted. Elsewhere (local dev, tests, previews) it fails open so a
  // half-configured environment can still be exercised by hand.
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret && process.env.VERCEL_ENV === 'production') {
    console.error('[inbound] RESEND_WEBHOOK_SECRET not set on production; refusing unsigned mail');
    res.status(401).json({ ok: false, error: 'invalid signature' });
    return;
  }
  if (webhookSecret) {
    const v = verifySvixSignature(
      webhookSecret,
      { id: header(req, 'svix-id'), timestamp: header(req, 'svix-timestamp'), signature: header(req, 'svix-signature') },
      rawBody,
      Date.now(),
    );
    if (!v.ok) {
      console.warn('[inbound] svix verification failed:', v.reason);
      res.status(401).json({ ok: false, error: 'invalid signature' });
      return;
    }
  }

  let payload: { type?: string; data?: ReceivedEmailData };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ ok: false, error: 'bad json' });
    return;
  }
  if (payload?.type !== 'email.received' || !payload.data) {
    res.status(200).json({ ok: true, ignored: 'event type' });
    return;
  }
  try {
    const email = await fetchInboundEmail(payload.data);
    const result = await processInboundEmail(db, email, secret, sendInboundReplyNotification);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[inbound] processing failed:', err);
    await reportServerError(err, '/api/inbound/feedback');
    // 200 so Resend doesn't hammer retries on a bug; we've logged it.
    res.status(200).json({ ok: false, error: 'processing failed' });
  }
}

export default withFlare(handler);

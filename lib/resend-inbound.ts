import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../db/schema.js';
import { feedback } from '../db/schema.js';
import { decodeReplyAddress } from './feedback-thread-address.js';
import { stripQuotedReply, isAutoReply } from './email-reply-parser.js';
import { recordInboundReply } from './feedback.js';

type DB = LibSQLDatabase<typeof schema>;

// Our internal, provider-agnostic shape. The adapter below maps Resend's
// payload into this; the pipeline only ever sees this.
export type ParsedInboundEmail = {
  toAddresses: string[];
  fromAddress: string;
  text: string;
  headers: Record<string, string>;
  messageId: string;
};

export type InboundResult = { status: 'recorded' | 'ignored'; reason?: string };

const EXCERPT_MAX = 280;

/** Fully tested core: decode → verify → parse → record → notify. Every
 *  rejection is a quiet { status: 'ignored' }, never a throw: the shared
 *  crystalprism.io inbox delivers every app's mail to every app. */
export async function processInboundEmail(
  db: DB,
  email: ParsedInboundEmail,
  secret: string,
  onRecorded: (info: { fromEmail: string; excerpt: string }) => Promise<void>,
): Promise<InboundResult> {
  let feedbackId: string | null = null;
  for (const addr of email.toAddresses) {
    const decoded = decodeReplyAddress(addr, secret);
    if (decoded.ok) { feedbackId = decoded.feedbackId; break; }
  }
  if (!feedbackId) return { status: 'ignored', reason: 'no matching address' };

  if (isAutoReply(email.headers)) return { status: 'ignored', reason: 'auto-reply' };

  const [row] = await db.select().from(feedback).where(eq(feedback.id, feedbackId)).limit(1);
  if (!row) return { status: 'ignored', reason: 'feedback not found' };

  const body = stripQuotedReply(email.text);
  if (!body) return { status: 'ignored', reason: 'empty body' };

  const { recorded } = await recordInboundReply(db, { feedbackId, body, sourceMessageId: email.messageId });
  if (!recorded) return { status: 'ignored', reason: 'duplicate' };

  const excerpt = body.length > EXCERPT_MAX ? `${body.slice(0, EXCERPT_MAX)}…` : body;
  await onRecorded({ fromEmail: email.fromAddress, excerpt });
  return { status: 'recorded' };
}

// ─── Resend adapter ──────────────────────────────────────────────────────────
// Ported from giftme, which verified it against the installed `resend` SDK's
// types. The `email.received` webhook payload carries metadata only — id is
// `email_id`, not `id` — and no headers or body. The parsed text body and
// headers come from `resend.emails.receiving.get(email_id)`. Keep this
// mapping, not the pipeline, as the only thing that changes if Resend's shape
// changes.
export type ReceivedEmailData = {
  email_id: string;
  from?: string;
  to?: string[];
  received_for?: string[];
  message_id?: string;
};

export async function fetchInboundEmail(data: ReceivedEmailData): Promise<ParsedInboundEmail> {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data: full, error } = await resend.emails.receiving.get(data.email_id);

  if (error || !full) {
    throw new Error(`Failed to fetch inbound email ${data.email_id}: ${error?.message || 'email not found'}`);
  }

  const toAddresses = [...(data.to ?? []), ...(data.received_for ?? [])];
  return {
    toAddresses,
    fromAddress: full.from ?? data.from ?? '',
    text: full.text ?? '',
    headers: full.headers ?? {},
    messageId: data.message_id ?? data.email_id,
  };
}

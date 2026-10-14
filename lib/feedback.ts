import { asc, eq, inArray } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { uid } from './api-helpers.js';
import * as schema from '../db/schema.js';
import { feedback, feedbackMessages } from '../db/schema.js';
import type { FeedbackRow, FeedbackMessageRow } from '../db/schema.js';
import type { EmailOutcome } from './feedback-email.js';

type DB = LibSQLDatabase<typeof schema>;

export const MAX_REPLY_LENGTH = 5000;

/** Thrown by appendAdminReply for a bad reply body — safe to surface to the admin as-is. */
export class FeedbackReplyValidationError extends Error {}

/** Sends a conversation reply email and reports what actually happened. */
export type ReplySender = (feedback: FeedbackRow, body: string) => Promise<EmailOutcome>;

/** Batch-fetches threads for many feedback ids in one query (avoids N+1 on the admin/mine lists). */
export async function listThreadsFor(db: DB, feedbackIds: string[]): Promise<Map<string, FeedbackMessageRow[]>> {
  const out = new Map<string, FeedbackMessageRow[]>();
  if (feedbackIds.length === 0) return out;
  const rows = await db
    .select()
    .from(feedbackMessages)
    .where(inArray(feedbackMessages.feedbackId, feedbackIds))
    .orderBy(asc(feedbackMessages.createdAt));
  for (const r of rows) {
    const list = out.get(r.feedbackId) ?? [];
    list.push(r);
    out.set(r.feedbackId, list);
  }
  return out;
}

/** Public projection of a message: strips the email telemetry — the delivery
 *  outcome (email_status) and the inbound provider id (source_message_id) —
 *  which must never reach the user-facing "My submissions" view (client
 *  payload, not just render). `channel` stays: it drives the "via email" mark. */
export function stripEmailTelemetry(
  m: FeedbackMessageRow,
): Omit<FeedbackMessageRow, 'emailStatus' | 'sourceMessageId'> {
  const { emailStatus: _emailStatus, sourceMessageId: _sourceMessageId, ...rest } = m;
  return rest;
}

/**
 * Appends an admin reply to a feedback thread and, when the author has an
 * email on file AND opted into notifications, attempts to notify them —
 * recording the real outcome ("sent" | "failed" | "skipped") on the
 * message row (fleet-standard opt-in semantics). Never throws on a
 * failed send; a failed email still leaves the reply posted. Bumps
 * feedback.updatedAt but never touches feedback.status (that's a separate
 * action). Always channel 'web' — inbound email replies go through
 * recordInboundReply instead.
 */
export async function appendAdminReply(
  db: DB,
  sender: ReplySender,
  input: { feedback: FeedbackRow; body: string },
): Promise<FeedbackMessageRow> {
  const body = input.body.trim();
  if (!body) throw new FeedbackReplyValidationError('Enter a reply.');
  if (body.length > MAX_REPLY_LENGTH) {
    throw new FeedbackReplyValidationError(`Reply must be ${MAX_REPLY_LENGTH} characters or fewer.`);
  }

  const id = uid();
  const createdAt = new Date().toISOString();
  const shouldSend = Boolean(input.feedback.notify && input.feedback.userEmail && input.feedback.userEmail.trim());

  await db.insert(feedbackMessages).values({
    id,
    feedbackId: input.feedback.id,
    author: 'admin',
    channel: 'web',
    body,
    emailStatus: null,
    createdAt,
  });

  let emailStatus: EmailOutcome = 'skipped';
  if (shouldSend) {
    try {
      emailStatus = await sender(input.feedback, body);
    } catch (err) {
      console.error('[feedback] reply email threw:', err);
      emailStatus = 'failed';
    }
  }

  const [finalRow] = await db
    .update(feedbackMessages)
    .set({ emailStatus })
    .where(eq(feedbackMessages.id, id))
    .returning();

  await db.update(feedback).set({ updatedAt: createdAt }).where(eq(feedback.id, input.feedback.id));

  return finalRow;
}

/**
 * Records a user's emailed reply (api/inbound/feedback.ts): appends a
 * user/email message and reopens the feedback to 'new'. Idempotent on the
 * provider's message id — the UNIQUE index on source_message_id is the
 * dedupe, so a retried delivery (even a concurrent one) inserts nothing and
 * reports recorded: false. email_status stays null — user messages never
 * carry send-outcome telemetry.
 */
export async function recordInboundReply(
  db: DB,
  input: { feedbackId: string; body: string; sourceMessageId: string; now?: Date },
): Promise<{ recorded: boolean }> {
  const createdAt = (input.now ?? new Date()).toISOString();
  const inserted = await db
    .insert(feedbackMessages)
    .values({
      id: uid(),
      feedbackId: input.feedbackId,
      author: 'user',
      channel: 'email',
      body: input.body,
      sourceMessageId: input.sourceMessageId,
      emailStatus: null,
      createdAt,
    })
    .onConflictDoNothing({ target: feedbackMessages.sourceMessageId })
    .returning({ id: feedbackMessages.id });
  if (inserted.length === 0) return { recorded: false };
  await db.update(feedback).set({ status: 'new', updatedAt: createdAt }).where(eq(feedback.id, input.feedbackId));
  return { recorded: true };
}

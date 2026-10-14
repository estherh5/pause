import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Activity, ChartType } from '../lib/types.js';

/**
 * One table for every plan pause has ever stored (spec D3):
 *  - anonymous share: owner_email NULL, name NULL
 *  - saved plan:      owner_email + name + name_key
 *  - legacy row:      copied from Neon `activities`, share_id = its external_id, source 'legacy'
 * A share link always resolves through share_id, whichever kind the row is.
 */
export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    shareId: text('share_id').notNull().unique(),
    ownerEmail: text('owner_email'),
    name: text('name'),
    nameKey: text('name_key'),
    activities: text('activities', { mode: 'json' }).$type<Record<string, Activity[]>>().notNull(),
    chartTypes: text('chart_types', { mode: 'json' }).$type<Record<string, ChartType>>().notNull(),
    timeUnit: text('time_unit').notNull(),
    month: text('month'),
    year: integer('year'),
    source: text('source').notNull().default('web'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    // SQLite treats NULLs as distinct in a unique index, so anonymous rows never collide.
    uniqueIndex('plans_owner_name_key').on(t.ownerEmail, t.nameKey),
    index('plans_owner_updated').on(t.ownerEmail, t.updatedAt),
    index('plans_created').on(t.createdAt),
  ],
);

// Admission is by email on the shared crystalprism session: the owner, or a row here
// that is accepted and not revoked. There is no users table.
export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  // Lowercased at every write. This is what ADMITS: the token only selects
  // which invitation is being looked at.
  email: text('email').notNull().unique(),
  token: text('token').notNull().unique(),
  invitedBy: text('invited_by'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  // No DEFAULT on either timestamp: both are computed together at issue time,
  // and a default that supplied one of them would let a row exist with an
  // expiry unrelated to its creation.
  expiresAt: integer('expires_at').notNull(),
  acceptedAt: integer('accepted_at'),
  revokedAt: integer('revoked_at'),
  emailStatus: text('email_status'), // 'sent' | 'failed' | 'skipped' | null
});

// Fleet-standard feedback loop: any signed-in user (owner or viewer) can file
// a report; the owner triages it (status + response note) from Settings.
export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  userEmail: text('user_email').notNull(),
  type: text('type').notNull(), // 'bug' | 'idea' | 'other'
  message: text('message').notNull(),
  pageUrl: text('page_url'),
  userAgent: text('user_agent'),
  notify: integer('notify', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('new'), // new | in-progress | addressed | declined
  response: text('response'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
});

// Conversation thread for a feedback row: each reply (admin, or the user
// answering a reply email — api/inbound/feedback.ts) is a row here instead
// of overwriting the single feedback.response column. The legacy response column is kept (retained, no longer written) —
// existing non-empty responses are backfilled by
// scripts/migrate-feedback-responses.sql as pre-tracking admin messages.
export const feedbackMessages = sqliteTable(
  'feedback_messages',
  {
    id: text('id').primaryKey(),
    feedbackId: text('feedback_id')
      .notNull()
      .references(() => feedback.id, { onDelete: 'cascade' }),
    author: text('author').notNull(), // 'admin' | 'user'
    channel: text('channel').notNull().default('web'), // 'web' | 'email' (an inbound reply to a feedback email)
    body: text('body').notNull(),
    // Resend's message id for an inbound email reply. UNIQUE is the real dedupe:
    // a provider retry re-delivers the same mail, and the second insert must fail.
    sourceMessageId: text('source_message_id').unique(),
    emailStatus: text('email_status'), // 'sent' | 'failed' | 'skipped' | null (user messages, pre-tracking admin messages)
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_feedback_messages_feedback').on(t.feedbackId, t.createdAt)],
);

export type PlanRow = typeof plans.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type FeedbackRow = typeof feedback.$inferSelect;
export type FeedbackMessageRow = typeof feedbackMessages.$inferSelect;

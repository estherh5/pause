import { Resend } from 'resend';
import { EMAIL_THEME, escapeHtml, renderEmailShell, wrapEmailDocument } from './email-shell.js';
import { FROM } from './email.js';
import { REPLY_SEPARATOR } from './email-reply-parser.js';
import { encodeReplyAddress } from './feedback-thread-address.js';
import { ownerEmail } from './admission.js';

const APP_URL = process.env.APP_URL || 'https://pause.crystalprism.io';

/** Outcome of a single feedback-conversation email send attempt, recorded on the message row. */
export type EmailOutcome = 'sent' | 'failed' | 'skipped';

/**
 * The pre-wrap reply-body div. CRITICAL, not cosmetic — see DESIGN.md's
 * "Transactional email" section and the shell's own DARK_PROPERTY comment:
 * an element with no color and no class inherits the user-agent default,
 * which flips with the reader's OS dark-mode preference even though the
 * ground around it stays pinned to its light value inline. Pinned here the
 * same way every other element in the shell pins its color: the LIGHT
 * value inline (`color:${EMAIL_THEME.ink}`) plus the `pause-ink`/
 * `pause-hairline` classes for clients that DO honor the dark media
 * query.
 */
function replyBodyHtml(text: string): string {
  return `<div class="pause-ink pause-hairline" style="color:${EMAIL_THEME.ink};white-space:pre-wrap;border-top:2px solid ${EMAIL_THEME.hairline};padding-top:12px;margin-top:12px">${escapeHtml(text)}</div>`;
}

/** Build the "an admin replied to your feedback" email. Pure + exported for
 *  testing — no network here. */
export function buildFeedbackReplyEmail(replyBody: string): { subject: string; html: string; text: string } {
  const subject = 'Esther replied to your Pause feedback';
  // The separator sits at the TOP: a mail client quotes everything below the
  // user's own text, so lib/email-reply-parser.ts cutting at this exact
  // string is what isolates their reply (api/inbound/feedback.ts). It goes
  // BEFORE the shell, never inside its body, so a client that rebuilds a
  // plain-text quote from the HTML still meets the separator first. Explicit
  // ground + ink3 (inline and as classes): it is the one element outside the
  // shell's ground div, painting straight onto the client canvas.
  const html =
    `<p class="${EMAIL_THEME.slug}-ground ${EMAIL_THEME.slug}-ink3" style="background:${EMAIL_THEME.ground};color:${EMAIL_THEME.ink3};font-size:12px">${REPLY_SEPARATOR}</p>` +
    renderEmailShell({
      kicker: 'FEEDBACK REPLY',
      body: replyBodyHtml(replyBody),
      cta: { label: 'View it', href: APP_URL },
    });
  const text =
    `${REPLY_SEPARATOR}\n\n` +
    `Esther replied to your Pause feedback:\n\n${replyBody}\n\nReply to this email to add more.\nView it: ${APP_URL}\n`;
  return { subject, html, text };
}

/**
 * Sends the "an admin replied to your feedback" notification and REPORTS its
 * outcome (never throws) — used by appendAdminReply, which needs a real
 * sent/failed/skipped status to record on the message row. Unlike
 * sendShareInvite, an unset RESEND_API_KEY or missing `to` is reported as
 * "skipped" rather than silently swallowed.
 */
export async function sendFeedbackReplyEmail(to: string, replyBody: string, replyTo?: string): Promise<EmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[feedback] RESEND_API_KEY not set — skipping reply email');
    return 'skipped';
  }
  if (!to) return 'skipped';
  try {
    const { subject, html, text } = buildFeedbackReplyEmail(replyBody);
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM,
      to,
      subject,
      text,
      html: wrapEmailDocument(html),
      replyTo: replyTo || undefined,
    });
    if (error) {
      console.error('[feedback] reply email failed:', error);
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('[feedback] reply email threw:', err);
    return 'failed';
  }
}

/**
 * Real sender for appendAdminReply: emails the feedback author about a new
 * admin reply and reports what actually happened. When FEEDBACK_REPLY_SECRET
 * is set, the mail carries a signed per-feedback Reply-To
 * (`reply+a.<feedbackId>.<hmac>@crystalprism.io`), so a plain "Reply" lands
 * back in the thread through api/inbound/feedback.ts. Unset or empty, it
 * sends without one — outbound never breaks on a missing inbound secret.
 */
export function makeFeedbackReplySender() {
  return async (feedback: { id: string; userEmail: string }, body: string): Promise<EmailOutcome> => {
    const secret = process.env.FEEDBACK_REPLY_SECRET;
    const domain = process.env.FEEDBACK_REPLY_DOMAIN || 'crystalprism.io';
    const replyTo = secret ? encodeReplyAddress(feedback.id, secret, domain) : undefined;
    return sendFeedbackReplyEmail(feedback.userEmail, body, replyTo);
  };
}

/** The owner-facing "a user replied by email" notification. Pure + exported
 *  for testing. */
export function buildInboundReplyNotification(input: { fromEmail: string; excerpt: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const href = `${APP_URL}/admin/feedback`;
  const subject = `↩︎ New feedback reply from ${input.fromEmail}`;
  // No heading: the kicker already names what this is.
  const html = renderEmailShell({
    kicker: 'FEEDBACK REPLY',
    meta: `${input.fromEmail} replied`,
    body: replyBodyHtml(input.excerpt),
    cta: { label: 'Open feedback triage', href },
  });
  const text = `${input.fromEmail} replied to feedback:\n\n${input.excerpt}\n\nOpen: ${href}\n`;
  return { subject, html, text };
}

/** Tells the owner (OWNER_EMAIL) that a user replied by email. Best-effort:
 *  logs and returns, never throws — the reply is already recorded. */
export async function sendInboundReplyNotification(input: { fromEmail: string; excerpt: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[feedback] RESEND_API_KEY not set — skipping inbound-reply notification');
    return;
  }
  try {
    const { subject, html, text } = buildInboundReplyNotification(input);
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM,
      to: ownerEmail(),
      subject,
      text,
      html: wrapEmailDocument(html),
    });
    if (error) console.error('[feedback] inbound-reply notification failed:', error);
  } catch (err) {
    console.error('[feedback] inbound-reply notification threw:', err);
  }
}

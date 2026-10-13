import { Resend } from 'resend';
import { EMAIL_THEME, escapeHtml, renderEmailShell, wrapEmailDocument } from './email-shell.js';
import { FROM } from './email.js';

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
  const html = renderEmailShell({
    kicker: 'FEEDBACK REPLY',
    body: replyBodyHtml(replyBody),
    cta: { label: 'View it', href: APP_URL },
  });
  const text = `Esther replied to your Pause feedback:\n\n${replyBody}\n\nView it: ${APP_URL}\n`;
  return { subject, html, text };
}

/**
 * Sends the "an admin replied to your feedback" notification and REPORTS its
 * outcome (never throws) — used by appendAdminReply, which needs a real
 * sent/failed/skipped status to record on the message row. Unlike
 * sendShareInvite, an unset RESEND_API_KEY or missing `to` is reported as
 * "skipped" rather than silently swallowed.
 */
export async function sendFeedbackReplyEmail(to: string, replyBody: string): Promise<EmailOutcome> {
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

/** Real sender for appendAdminReply: emails the feedback author about a new
 *  admin reply and reports what actually happened. */
export function makeFeedbackReplySender() {
  return async (feedback: { userEmail: string }, body: string): Promise<EmailOutcome> =>
    sendFeedbackReplyEmail(feedback.userEmail, body);
}

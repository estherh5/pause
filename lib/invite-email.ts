import { Resend } from 'resend';
import { escapeHtml, renderEmailShell, wrapEmailDocument } from './email-shell.js';
import { FROM } from './email.js';

const APP_URL = process.env.APP_URL || 'https://pause.crystalprism.io';

/** Where an invitation link points. pause uses BrowserRouter, so the token is
 *  a path segment, percent-encoded. */
export function inviteAcceptUrl(token: string, appUrl: string = APP_URL): string {
  return `${appUrl}/invite/${encodeURIComponent(token)}`;
}

/** The owner's note, rendered as a quoted block. Escaped: this is the one
 *  free-text field an invitation carries. */
export function inviteNoteHtml(note: string | null | undefined): string {
  if (!note || !note.trim()) return '';
  return (
    `<blockquote style="margin:16px 0 0;padding:0 0 0 12px;border-left:2px solid #dcdcdc">` +
    `<p style="margin:0">${escapeHtml(note.trim())}</p>` +
    `</blockquote>`
  );
}

export function buildAccountInviteEmail(opts: {
  token: string;
  note?: string | null;
  appUrl?: string;
}): { subject: string; html: string; text: string } {
  const url = inviteAcceptUrl(opts.token, opts.appUrl ?? APP_URL);
  const subject = "You're invited to Pause";
  const html = renderEmailShell({
    kicker: 'INVITATION',
    body:
      `<p style="margin:0">You're invited to save plans in Pause.</p>` +
      inviteNoteHtml(opts.note) +
      `<p style="margin:16px 0 0">This link is yours alone: it only works for the address it was sent to.</p>`,
    cta: { label: 'Accept invitation', href: url },
  });
  const text =
    `You're invited to save plans in Pause.\n\n` +
    (opts.note && opts.note.trim() ? `"${opts.note.trim()}"\n\n` : '') +
    `Accept: ${url}\n\nThis link only works for the address it was sent to.\n`;
  return { subject, html, text };
}

/** Send an account invitation. The OUTCOME MATTERS and is reported rather than
 *  swallowed: the invite row is not access on its own, so an unsent email means
 *  a person who can never get in and an owner who believes they can. The row is
 *  still written by the caller either way, and the owner can resend. */
export async function sendAccountInvite(
  to: string,
  opts: { token: string; note?: string | null; appUrl?: string },
): Promise<'sent' | 'failed' | 'skipped'> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[invite] RESEND_API_KEY not set, skipping account invite email');
    return 'skipped';
  }
  try {
    const { subject, html, text } = buildAccountInviteEmail(opts);
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM,
      to,
      subject,
      text,
      html: wrapEmailDocument(html),
    });
    if (error) {
      console.error('[invite] account invite send failed:', error);
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('[invite] account invite send threw:', err);
    return 'failed';
  }
}

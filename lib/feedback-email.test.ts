import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send } };
  }),
}));

import {
  sendFeedbackReplyEmail,
  makeFeedbackReplySender,
  buildFeedbackReplyEmail,
  sendInboundReplyNotification,
} from './feedback-email';
import { EMAIL_THEME } from './email-shell';
import { decodeReplyAddress } from './feedback-thread-address';
import { REPLY_SEPARATOR, stripQuotedReply } from './email-reply-parser';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'Pause <pause@crystalprism.io>';
  send.mockResolvedValue({ error: null });
});

describe('buildFeedbackReplyEmail', () => {
  it('renders the shell header, kicker, reply body, and a CTA', () => {
    const { html } = buildFeedbackReplyEmail('hi there');
    expect(html).toContain('Pause'); // wordmark
    expect(html).toContain('FEEDBACK REPLY');
    expect(html).toContain('hi there');
    expect(html).toContain('View it');
    expect(html).toContain('pause.crystalprism.io'); // footer link
  });

  it('escapes reply body content and pins its colour + class', () => {
    const { html } = buildFeedbackReplyEmail('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain(`color:${EMAIL_THEME.ink}`);
    expect(html).toContain('class="pause-ink pause-hairline"');
  });

  it('keeps the plain-text twin in sync with the html', () => {
    const { text } = buildFeedbackReplyEmail('body text');
    expect(text).toContain('body text');
    expect(text).toContain('https://pause.crystalprism.io');
  });
});

describe('subject',()=>{ it('names Esther and Pause',()=>{ expect(buildFeedbackReplyEmail('x').subject).toBe('Esther replied to your Pause feedback'); }); });

describe('sendFeedbackReplyEmail', () => {
  it('sends and reports "sent" on success', async () => {
    const outcome = await sendFeedbackReplyEmail('friend@example.com', 'hi there');
    expect(outcome).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'friend@example.com',
      from: 'Pause <pause@crystalprism.io>',
    });
  });

  it('wraps the html with the document-level color-scheme meta at the send site', async () => {
    await sendFeedbackReplyEmail('friend@example.com', 'hi there');
    const sentHtml = send.mock.calls[0][0].html as string;
    expect(sentHtml).toContain('<meta name="color-scheme" content="light">');
  });

  it('reports "skipped" (no send attempt) when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const outcome = await sendFeedbackReplyEmail('friend@example.com', 'hi');
    expect(outcome).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports "skipped" (no send attempt) when the recipient is blank', async () => {
    const outcome = await sendFeedbackReplyEmail('', 'hi');
    expect(outcome).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports "failed" when Resend returns an error object', async () => {
    send.mockResolvedValue({ error: { message: 'bad request' } });
    const outcome = await sendFeedbackReplyEmail('friend@example.com', 'hi');
    expect(outcome).toBe('failed');
  });

  it('reports "failed" (never throws) when the send call rejects', async () => {
    send.mockRejectedValue(new Error('resend down'));
    await expect(sendFeedbackReplyEmail('friend@example.com', 'hi')).resolves.toBe('failed');
  });
});

describe('reply separator', () => {
  it('opens both the html and the text part with the separator the inbound parser cuts at', () => {
    const { html, text } = buildFeedbackReplyEmail('hi there');
    expect(text.startsWith(REPLY_SEPARATOR)).toBe(true);
    expect(html.indexOf(REPLY_SEPARATOR)).toBeLessThan(html.indexOf('FEEDBACK REPLY'));
    // A client that quotes the whole text part under the user's line:
    expect(stripQuotedReply(`thanks!\n\n${text.split('\n').map((l) => `> ${l}`).join('\n')}`)).toBe('thanks!');
  });
});

describe('makeFeedbackReplySender', () => {
  afterEach(() => {
    delete process.env.FEEDBACK_REPLY_SECRET;
    delete process.env.FEEDBACK_REPLY_DOMAIN;
  });

  it("delegates to sendFeedbackReplyEmail with the feedback row's email", async () => {
    const sender = makeFeedbackReplySender();
    const outcome = await sender({ id: 'fb-1', userEmail: 'friend@example.com' }, 'body text');
    expect(outcome).toBe('sent');
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'friend@example.com' });
  });

  it('carries a signed reply+a Reply-To that decodes back to this feedback id', async () => {
    // Discriminating case: the address must verify under the SAME secret and
    // name this row's id — a well-formed but unsigned address would not.
    process.env.FEEDBACK_REPLY_SECRET = 'reply-secret';
    await makeFeedbackReplySender()({ id: 'fb-1', userEmail: 'friend@example.com' }, 'body text');
    const replyTo = send.mock.calls[0][0].replyTo as string;
    expect(replyTo).toMatch(/^reply\+a\.fb-1\.[0-9a-f]{16}@crystalprism\.io$/);
    expect(decodeReplyAddress(replyTo, 'reply-secret')).toEqual({ ok: true, feedbackId: 'fb-1' });
    expect(decodeReplyAddress(replyTo, 'other-secret').ok).toBe(false);
  });

  it('honors FEEDBACK_REPLY_DOMAIN', async () => {
    process.env.FEEDBACK_REPLY_SECRET = 'reply-secret';
    process.env.FEEDBACK_REPLY_DOMAIN = 'example.test';
    await makeFeedbackReplySender()({ id: 'fb-1', userEmail: 'friend@example.com' }, 'x');
    expect(send.mock.calls[0][0].replyTo).toMatch(/@example\.test$/);
  });

  it('still sends, with no Reply-To, when FEEDBACK_REPLY_SECRET is empty', async () => {
    process.env.FEEDBACK_REPLY_SECRET = '';
    const outcome = await makeFeedbackReplySender()({ id: 'fb-1', userEmail: 'friend@example.com' }, 'x');
    expect(outcome).toBe('sent');
    expect(send.mock.calls[0][0].replyTo).toBeUndefined();
  });
});

describe('sendInboundReplyNotification', () => {
  afterEach(() => {
    delete process.env.OWNER_EMAIL;
  });

  it('emails the owner (OWNER_EMAIL) with the excerpt and a triage link', async () => {
    process.env.OWNER_EMAIL = 'Owner@Example.com';
    await sendInboundReplyNotification({ fromEmail: 'u@x.com', excerpt: 'still broken' });
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe('owner@example.com');
    expect(msg.subject).toContain('u@x.com');
    expect(msg.text).toContain('still broken');
    expect(msg.text).toContain('https://pause.crystalprism.io/admin/feedback');
  });

  it('never throws when the send rejects', async () => {
    send.mockRejectedValue(new Error('resend down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendInboundReplyNotification({ fromEmail: 'u@x.com', excerpt: 'x' })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

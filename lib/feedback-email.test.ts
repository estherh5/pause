import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send } };
  }),
}));

import { sendFeedbackReplyEmail, makeFeedbackReplySender, buildFeedbackReplyEmail } from './feedback-email';
import { EMAIL_THEME } from './email-shell';

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

describe('makeFeedbackReplySender', () => {
  it('delegates to sendFeedbackReplyEmail with the feedback row\'s email', async () => {
    const sender = makeFeedbackReplySender();
    const outcome = await sender({ userEmail: 'friend@example.com' }, 'body text');
    expect(outcome).toBe('sent');
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'friend@example.com' });
  });
});

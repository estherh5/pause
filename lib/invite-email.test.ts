import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send } };
  }),
}));

import { buildAccountInviteEmail, inviteAcceptUrl, inviteNoteHtml, sendAccountInvite } from './invite-email';
import { FROM } from './email';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 're_test';
  send.mockResolvedValue({ error: null });
});

describe('the account invitation', () => {
  it('points at the SPA path route, escaped', () => {
    expect(inviteAcceptUrl('abc-123')).toBe('https://pause.crystalprism.io/invite/abc-123');
    expect(inviteAcceptUrl('a/b')).toBe('https://pause.crystalprism.io/invite/a%2Fb');
  });

  it('uses the pause subject, copy and CTA', () => {
    const { subject, html, text } = buildAccountInviteEmail({ token: 'tok-1' });
    expect(subject).toBe("You're invited to Pause");
    expect(html).toContain("You're invited to save plans in Pause.");
    expect(html).toContain('Accept invitation');
    expect(text).toContain("You're invited to save plans in Pause.");
    expect(html).not.toMatch(/methods/i);
  });

  it('puts the accept link in BOTH the html and the plain text', () => {
    const { html, text } = buildAccountInviteEmail({ token: 'tok-1' });
    const url = inviteAcceptUrl('tok-1');
    expect(html).toContain(url);
    expect(text).toContain(url);
  });

  it('escapes the note, the one free-text field an invitation carries', () => {
    const evil = '<img src=x onerror="alert(1)">';
    const { html } = buildAccountInviteEmail({ token: 't', note: evil });
    expect(html).not.toContain(evil);
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('renders no quote block at all when there is no note', () => {
    for (const note of [null, undefined, '', '   ']) {
      expect(inviteNoteHtml(note), JSON.stringify(note)).toBe('');
    }
    expect(inviteNoteHtml('hi')).toContain('<blockquote');
  });

  it('says the link is address-bound, because that is what makes a forward safe', () => {
    const { html, text } = buildAccountInviteEmail({ token: 't' });
    expect(html).toMatch(/only works for the address it was sent to/i);
    expect(text).toMatch(/only works for the address it was sent to/i);
  });
});

describe('sendAccountInvite', () => {
  it('sends from FROM, with the color-scheme meta', async () => {
    expect(await sendAccountInvite('friend@example.com', { token: 't' })).toBe('sent');
    const arg = send.mock.calls[0][0];
    expect(arg).toMatchObject({ to: 'friend@example.com', from: FROM });
    expect(arg.html).toContain('<meta name="color-scheme" content="light">');
  });

  it('reports "skipped" rather than pretending, when there is no transport', async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendAccountInvite('a@b.co', { token: 't' })).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports "failed" when the send errors or rejects', async () => {
    send.mockResolvedValueOnce({ error: { message: 'no' } });
    expect(await sendAccountInvite('a@b.co', { token: 't' })).toBe('failed');
    send.mockRejectedValueOnce(new Error('down'));
    expect(await sendAccountInvite('a@b.co', { token: 't' })).toBe('failed');
  });
});

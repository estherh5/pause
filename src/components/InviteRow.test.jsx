import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import InviteRow from './InviteRow.jsx';
import { jsonResponse } from '../test/render.jsx';

import { statusOf } from '../../lib/invite-status.ts';

// Status comes from the server's own statusOf over the timestamps, never typed
// by hand: a hand-typed 'pending' once kept this suite green while every real
// pending row rendered an empty pill and no controls.
const NOW = 1_000;
const inv = (over) => {
  const row = { id: 'i1', email: 'a@example.com', note: null, invitedBy: 'o@example.com', createdAt: 1, expiresAt: NOW + 10, acceptedAt: null, revokedAt: null, emailStatus: 'sent', ...over };
  return { ...row, status: statusOf(row, NOW) };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REMOVE_ARM = 'They lose saved plans right away. Their plans stay, and Restore brings them back.';
const REMOVE_DONE = "Removed. They can't open saved plans anymore. Their plans are kept, and Restore brings them back.";

function mount(row) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    calls.push({ path: input, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    return new Response(null, { status: 204 });
  }));
  const client = new QueryClient();
  const ui = (r) => <QueryClientProvider client={client}><ul><InviteRow inv={r} /></ul></QueryClientProvider>;
  const utils = render(ui(row));
  return { ...utils, calls, update: (r) => utils.rerender(ui(r)) };
}

describe('InviteRow', () => {
  it('pending: Resend and a two-tap Revoke', async () => {
    const user = userEvent.setup();
    const { calls } = mount(inv());
    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(calls).toHaveLength(0);
    await wait(400);
    await user.click(screen.getByRole('button', { name: 'Really revoke?' }));
    expect(calls[0]).toMatchObject({ path: '/api/access?resource=invites&action=revoke', method: 'POST', body: { id: 'i1' } });
  });

  it('Resend posts the id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(inv())));
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient()}><ul><InviteRow inv={inv()} /></ul></QueryClientProvider>);
    await user.click(screen.getByRole('button', { name: 'Resend' }));
    expect(fetch).toHaveBeenCalledWith('/api/access?resource=invites&action=resend', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('Resent to a@example.com.')).toBeInTheDocument();
  });

  it('accepted: Remove arms with the consequence, then removes', async () => {
    const user = userEvent.setup();
    const { calls } = mount(inv({ acceptedAt: 5 }));
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resend' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText(REMOVE_ARM)).toBeInTheDocument();
    await wait(400);
    await user.click(screen.getByRole('button', { name: 'Really remove?' }));
    expect(calls[0].path).toBe('/api/access?resource=invites&action=revoke');
    expect(await screen.findByText(REMOVE_DONE)).toBeInTheDocument();
  });

  // The server answers with codes ('not found', 'revoked', 'unauthorized',
  // 'forbidden') that are never fit to show; each status gets a sentence that
  // says what to do next.
  it.each([
    [404, { error: 'not found' }, 'This invitation is gone. Reload the page to see the current list.'],
    [409, { error: 'revoked' }, 'This invitation was revoked. Restore it first, then resend.'],
    [401, { error: 'unauthorized' }, 'You were signed out. Sign in again, then retry.'],
    [403, { error: 'forbidden' }, 'Only the owner can change invitations.'],
    [500, { error: 'internal' }, "Something went wrong on Pause's side. Try again in a minute."],
    [405, 'Method Not Allowed', "Something went wrong on Pause's side. Try again in a minute."],
  ])('a %i on Resend reads as a sentence, never the raw code', async (status, body, text) => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })));
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient()}><ul><InviteRow inv={inv()} /></ul></QueryClientProvider>);
    await user.click(screen.getByRole('button', { name: 'Resend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('a dropped connection says to check it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient()}><ul><InviteRow inv={inv()} /></ul></QueryClientProvider>);
    await user.click(screen.getByRole('button', { name: 'Resend' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't go through. Check your connection and try again.");
  });

  it('a held Enter cannot arm and confirm in one gesture', async () => {
    const user = userEvent.setup();
    const { calls } = mount(inv({ acceptedAt: 5 }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Really remove?' }));
    expect(calls).toHaveLength(0);
  });

  it('revoked after accept reads Removed with Restore only', () => {
    mount(inv({ acceptedAt: 5, revokedAt: 6 }));
    expect(screen.getByText('Removed')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Restore']);
  });

  it('revoked before accept reads Revoked', () => {
    mount(inv({ revokedAt: 6 }));
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.queryByText('Removed')).toBeNull();
  });

  it('keyboard focus lands on the new first control after a status change', async () => {
    const user = userEvent.setup();
    const { update } = mount(inv({ acceptedAt: 5 }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await wait(400);
    screen.getByRole('button', { name: 'Really remove?' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByText(REMOVE_DONE);
    update(inv({ acceptedAt: 5, revokedAt: 6 }));
    const restore = await screen.findByRole('button', { name: 'Restore' });
    expect(restore).toHaveFocus();
  });

  it('a pending invite whose email failed says so, with Resend and Revoke', () => {
    mount(inv({ emailStatus: 'failed' }));
    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByText('The email did not go out, but the invitation stands. Press Resend.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Resend', 'Revoke']);
  });

  it('expired: Resend and Revoke, no expiry date', () => {
    mount(inv({ expiresAt: NOW - 1 }));
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByText(/Expires/)).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Resend', 'Revoke']);
  });

  it('every status the server can return has a label and at least one control', () => {
    for (const over of [{}, { expiresAt: NOW - 1 }, { acceptedAt: 5 }, { revokedAt: 6 }, { acceptedAt: 5, revokedAt: 6 }]) {
      const { unmount, container } = mount(inv(over));
      expect(container.querySelector('.invite-pill').textContent).not.toBe('');
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
      unmount();
    }
  });
});

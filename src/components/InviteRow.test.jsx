import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import InviteRow from './InviteRow.jsx';
import { jsonResponse } from '../test/render.jsx';

const inv = (over) => ({ id: 'i1', email: 'a@example.com', note: null, invitedBy: 'o@example.com', createdAt: 1, expiresAt: 2, acceptedAt: null, revokedAt: null, emailStatus: 'sent', status: 'pending', ...over });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REMOVE_ARM = 'They lose saved plans right away. Their plans stay, and Restore brings them back.';

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
    expect(screen.getByText('Pending')).toBeInTheDocument();
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
    const { calls } = mount(inv({ status: 'accepted', acceptedAt: 5 }));
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resend' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText(REMOVE_ARM)).toBeInTheDocument();
    await wait(400);
    await user.click(screen.getByRole('button', { name: 'Really remove?' }));
    expect(calls[0].path).toBe('/api/access?resource=invites&action=revoke');
  });

  it('a held Enter cannot arm and confirm in one gesture', async () => {
    const user = userEvent.setup();
    const { calls } = mount(inv({ status: 'accepted', acceptedAt: 5 }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Really remove?' }));
    expect(calls).toHaveLength(0);
  });

  it('revoked after accept reads Removed with Restore only', () => {
    mount(inv({ status: 'revoked', acceptedAt: 5, revokedAt: 6 }));
    expect(screen.getByText('Removed')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Restore']);
  });

  it('revoked before accept reads Revoked', () => {
    mount(inv({ status: 'revoked', revokedAt: 6 }));
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.queryByText('Removed')).toBeNull();
  });

  it('keyboard focus lands on the new first control after a status change', async () => {
    const user = userEvent.setup();
    const { update } = mount(inv({ status: 'accepted', acceptedAt: 5 }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await wait(400);
    screen.getByRole('button', { name: 'Really remove?' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByText('Removed.');
    update(inv({ status: 'revoked', acceptedAt: 5, revokedAt: 6 }));
    const restore = await screen.findByRole('button', { name: 'Restore' });
    expect(restore).toHaveFocus();
  });
});

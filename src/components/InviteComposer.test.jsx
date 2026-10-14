import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InviteComposer from './InviteComposer.jsx';
import { jsonResponse, renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));

const owner = { state: 'owner', email: 'hoffman.esther@gmail.com', name: null };
// The owner's list never carries a token (api/access.ts#toAdminRow).
const row = (over) => ({ id: 'i1', email: 'a@example.com', note: null, invitedBy: owner.email, createdAt: 1, expiresAt: 2, acceptedAt: null, revokedAt: null, emailStatus: 'sent', status: 'pending', ...over });

function mount() {
  const calls = [];
  let respond = () => jsonResponse(row(), 201);
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    calls.push({ path: input, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    return respond();
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={client}><InviteComposer /></QueryClientProvider>);
  return { ...utils, calls, setRespond: (fn) => { respond = fn; } };
}

beforeEach(() => { window.localStorage.clear(); });

describe('InviteComposer', () => {
  it('posts { email, note } and clears the form on success', async () => {
    const user = userEvent.setup();
    const { calls } = mount();
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText(/Note/), 'Welcome');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByText('Invitation sent to new@example.com.')).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST');
    expect(post.path).toBe('/api/access?resource=invites');
    expect(post.body).toEqual({ email: 'new@example.com', note: 'Welcome' });
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText(/Note/)).toHaveValue('');
  });

  it("shows the server's message on a 400 and keeps what was typed", async () => {
    const user = userEvent.setup();
    const { setRespond } = mount();
    setRespond(() => jsonResponse({ error: 'Enter a valid email address.' }, 400));
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.type(screen.getByLabelText(/Note/), 'keep me');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(screen.getByLabelText(/Note/)).toHaveValue('keep me');
  });

  // Only a 400 carries a sentence; every other refusal is a code, and none of
  // them is a connection problem.
  it.each([
    [() => jsonResponse({ error: 'unauthorized' }, 401), 'You were signed out. Sign in again, then retry.'],
    [() => jsonResponse({ error: 'forbidden' }, 403), 'Only the owner can send invitations.'],
    [() => jsonResponse({ error: 'internal' }, 500), "Something went wrong on Pause's side. Try again in a minute."],
    [() => { throw new TypeError('Failed to fetch'); }, "The invitation didn't send. Check your connection and try again."],
  ])('a refusal that is not a 400 says what to do (%#)', async (respond, text) => {
    const user = userEvent.setup();
    const { setRespond } = mount();
    setRespond(respond);
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com');
  });

  it('a typed note survives an unmount and remount', async () => {
    const user = userEvent.setup();
    const first = mount();
    await user.type(screen.getByLabelText(/Note/), 'half written');
    await new Promise((r) => setTimeout(r, 500)); // the draft saves 400ms after the last keystroke
    first.unmount();
    mount();
    expect(await screen.findByDisplayValue('half written')).toBeInTheDocument();
  });
});

describe('Settings invite list', () => {
  it('renders email, status pill and actions from a list with no token field', async () => {
    const list = [
      row({ id: 'i1', email: 'pending@example.com', status: 'pending' }),
      row({ id: 'i2', email: 'in@example.com', status: 'accepted', acceptedAt: 5 }),
    ];
    expect(JSON.stringify(list)).not.toContain('token');
    renderApp({ route: '/settings', me: owner, routes: { '/api/access': () => jsonResponse(list) } });
    const pending = (await screen.findByText('pending@example.com')).closest('li');
    expect(within(pending).getByText('Invited')).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: 'Resend' })).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
    const accepted = screen.getByText('in@example.com').closest('li');
    expect(within(accepted).getByText('Accepted')).toBeInTheDocument();
    expect(within(accepted).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('is for the owner: a member sees a plain sentence, a signed-out visitor the sign-in note', async () => {
    renderApp({ route: '/settings', me: { state: 'member', email: 'm@example.com', name: null } });
    expect(await screen.findByText('This page is for the owner.')).toBeInTheDocument();
  });
});

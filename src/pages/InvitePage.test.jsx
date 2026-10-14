import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));

const VALID = { state: 'valid', invitedBy: 'hoffman.esther@gmail.com', note: null, maskedEmail: 'f••••d@example.com' };
const access = (view, accept) => (path) =>
  path.includes('action=accept') ? accept() : jsonResponse(view);
const FRIEND = { state: 'guest', email: 'friend@example.com', name: null };

describe('/invite/:token', () => {
  it('signed out: names the inviter and masked address, and Google returns to this invitation', async () => {
    renderApp({ route: '/invite/tok-abc', routes: { '/api/access': access(VALID) } });
    expect(await screen.findByText('hoffman.esther@gmail.com invited f••••d@example.com to save plans in Pause.')).toBeInTheDocument();
    const button = await screen.findByRole('button', { name: 'Sign in with Google' });
    const form = button.closest('form');
    expect(form).toHaveAttribute('action', '/api/auth/signin/google');
    expect(form.querySelector('input[name="callbackUrl"]')).toHaveValue('/invite/tok-abc');
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('friend@example.com');
  });

  it('signed in: Accept posts the token, then points to My plans', async () => {
    const { calls } = renderApp({
      route: '/invite/tok-abc', me: FRIEND,
      routes: { '/api/access': access(VALID, () => jsonResponse({ ok: true, email: 'friend@example.com' })) },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText("You're in. Your saved plans live in My plans.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My plans' })).toHaveAttribute('href', '/plans');
    const post = calls.find((c) => c.path.includes('action=accept'));
    expect(post.method).toBe('POST');
    expect(post.body).toEqual({ token: 'tok-abc' });
    await waitFor(() => expect(calls.filter((c) => c.path === '/api/me').length).toBeGreaterThan(1));
  });

  it('mismatch: says the invitation is for a different account and offers nothing to accept', async () => {
    renderApp({
      route: '/invite/tok-abc', me: { state: 'guest', email: 'other@example.com', name: null },
      routes: { '/api/access': access(VALID, () => jsonResponse({ ok: false, reason: 'mismatch', invited: 'f••••d@example.com' }, 403)) },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('This invitation is for a different account.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('invalid: one sentence, and no control that could grant access', async () => {
    renderApp({ route: '/invite/dead', routes: { '/api/access': access({ state: 'invalid' }) } });
    expect(await screen.findByText("This invitation link doesn't work. Ask for a new one.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('a network failure resolving the link reads as invalid', async () => {
    renderApp({ route: '/invite/tok', routes: { '/api/access': () => { throw new Error('offline'); } } });
    expect(await screen.findByText("This invitation link doesn't work. Ask for a new one.")).toBeInTheDocument();
  });

  it('/api/me failing says so and retries, instead of opening forever', async () => {
    let meUp = false;
    renderApp({
      route: '/invite/tok',
      routes: {
        '/api/access': access(VALID),
        '/api/me': () => (meUp ? jsonResponse(FRIEND) : jsonResponse({ error: 'down' }, 500)),
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Pause.");
    expect(screen.queryByText(/Opening the invitation/)).not.toBeInTheDocument();
    meUp = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });

  it('a 401 on Accept asks to sign in again and returns here, not "dead link"', async () => {
    renderApp({
      route: '/invite/tok-abc', me: FRIEND,
      routes: { '/api/access': access(VALID, () => jsonResponse({ error: 'unauthorized' }, 401)) },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in expired. Sign in again to accept.');
    const button = await screen.findByRole('button', { name: 'Sign in with Google' });
    expect(button.closest('form').querySelector('input[name="callbackUrl"]')).toHaveValue('/invite/tok-abc');
    expect(screen.queryByText(/doesn't work/)).not.toBeInTheDocument();
  });

  it('a network failure on Accept keeps the invitation and lets you try again', async () => {
    let up = false;
    renderApp({
      route: '/invite/tok', me: FRIEND,
      routes: { '/api/access': access(VALID, () => { if (!up) throw new Error('offline'); return jsonResponse({ ok: true }); }) },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Pause. Try again.");
    expect(screen.queryByText(/doesn't work/)).not.toBeInTheDocument();
    up = true;
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText(/You're in/)).toBeInTheDocument();
  });

  it('Accept cannot be pressed twice while in flight', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const { calls } = renderApp({
      route: '/invite/tok', me: FRIEND,
      routes: { '/api/access': access(VALID, () => gate) },
    });
    const accept = await screen.findByRole('button', { name: 'Accept' });
    await userEvent.click(accept);
    await userEvent.click(accept);
    expect(calls.filter((c) => c.path.includes('action=accept'))).toHaveLength(1);
    release(jsonResponse({ ok: true, email: 'friend@example.com' }));
    expect(await screen.findByText(/You're in/)).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignInButton from '../components/SignInButton.jsx';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));
describe('/signin', () => {
  it('posts to Google with the next path and links Privacy', async () => {
    renderApp({ route: '/signin?next=%2Fstats' });
    // The file's first wait pays the lazy page import and a cold *ByRole poll;
    // wait on the text, then check the role.
    await screen.findByText('Sign in with Google');
    const button = screen.getByRole('button', { name: 'Sign in with Google' });
    const form = button.closest('form');
    expect(form).toHaveAttribute('action', '/api/auth/signin/google');
    expect(form.querySelector('input[name="callbackUrl"]')).toHaveValue('/stats');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });
  it('an off-site next is ignored', async () => {
    renderApp({ route: '/signin?next=https%3A%2F%2Fevil.example' });
    const form = (await screen.findByRole('button', { name: 'Sign in with Google' })).closest('form');
    expect(form.querySelector('input[name="callbackUrl"]')).toHaveValue('/');
  });
  it('a protocol-relative next (//host) is ignored', async () => {
    renderApp({ route: '/signin?next=%2F%2Fevil.example%2Fx' });
    const form = (await screen.findByRole('button', { name: 'Sign in with Google' })).closest('form');
    expect(form.querySelector('input[name="callbackUrl"]')).toHaveValue('/');
  });
  it('a signed-in visitor is sent to /plans', async () => {
    renderApp({ route: '/signin', me: { state: 'member', email: 'm@example.com', name: null }, routes: { '/api/plans': () => new Response('[]') } });
    expect(await screen.findByRole('heading', { name: 'My plans' })).toBeInTheDocument();
  });

  it('a failed CSRF fetch says so and retries, instead of enabling a button that cannot work', async () => {
    let up = false;
    vi.stubGlobal('fetch', vi.fn(async () => (up
      ? new Response(JSON.stringify({ csrfToken: 't' }), { headers: { 'content-type': 'application/json' } })
      : Promise.reject(new Error('offline')))));
    render(<SignInButton next="/plans" />);
    expect(await screen.findByText("Couldn't reach sign-in.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    up = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  });
});

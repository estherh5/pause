import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));

const owner = { state: 'owner', email: 'hoffman.esther@gmail.com', name: null };
const item = (over) => ({
  id: 'f1', status: 'new', type: 'bug', userEmail: 'a@example.com', createdAt: '2026-10-01T12:00:00Z',
  pageUrl: '/plans', message: 'The timer skips a beat.', messages: [], ...over,
});

const posts = (calls) => calls.filter((c) => c.method === 'POST' && c.path.startsWith('/api/feedback?'));

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => { window.localStorage.clear(); });

describe('AdminFeedbackPage', () => {
  it('lists feedback for the owner', async () => {
    renderApp({ route: '/admin/feedback', me: owner, routes: { '/api/feedback': () => jsonResponse([item()]) } });
    expect(await screen.findByText('The timer skips a beat.')).toBeInTheDocument();
    expect(screen.getByText('Page: /plans')).toBeInTheDocument();
  });

  it('shows "No feedback yet." for an empty inbox', async () => {
    renderApp({ route: '/admin/feedback', me: owner, routes: { '/api/feedback': () => jsonResponse([]) } });
    expect(await screen.findByText('No feedback yet.')).toBeInTheDocument();
  });

  it('keeps a signed-in non-owner out without fetching the inbox', async () => {
    const { calls } = renderApp({ route: '/admin/feedback', me: { state: 'member', email: 'x@example.com' } });
    expect(await screen.findByText('This page is for the owner.')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/feedback')).toBe(false);
  });

  it('a double click on Send reply sends exactly one reply', async () => {
    const user = userEvent.setup();
    const held = deferred();
    const { calls } = renderApp({
      route: '/admin/feedback',
      me: owner,
      routes: {
        '/api/feedback?': () => held.promise,
        '/api/feedback': () => jsonResponse([item()]),
      },
    });
    await user.type(await screen.findByLabelText('Reply'), 'Fixed, thanks.');
    await user.dblClick(screen.getByRole('button', { name: 'Send reply' }));
    expect(posts(calls)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();

    held.resolve(jsonResponse({ ok: true }, 201));
    await waitFor(() => expect(screen.getByLabelText('Reply')).toHaveValue(''));
    expect(posts(calls)).toHaveLength(1);
    expect(posts(calls)[0]).toMatchObject({ path: '/api/feedback?id=f1&action=reply', body: { body: 'Fixed, thanks.' } });
  });

  it('keeps the typed reply and says so when the send fails', async () => {
    const user = userEvent.setup();
    renderApp({
      route: '/admin/feedback',
      me: owner,
      routes: {
        '/api/feedback?': () => jsonResponse({ error: 'boom' }, 500),
        '/api/feedback': () => jsonResponse([item()]),
      },
    });
    await user.type(await screen.findByLabelText('Reply'), 'keep me');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("The reply didn't send. Try again.");
    expect(screen.getByLabelText('Reply')).toHaveValue('keep me');
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeEnabled();
  });

  it("shows the server's code on a 400", async () => {
    const user = userEvent.setup();
    renderApp({
      route: '/admin/feedback',
      me: owner,
      routes: {
        '/api/feedback?': () => jsonResponse({ error: 'Reply is too long.' }, 400),
        '/api/feedback': () => jsonResponse([item()]),
      },
    });
    await user.type(await screen.findByLabelText('Reply'), 'x');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reply is too long.');
  });

  it('Send reply stays disabled for a blank reply', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/admin/feedback', me: owner, routes: { '/api/feedback': () => jsonResponse([item()]) } });
    await user.type(await screen.findByLabelText('Reply'), '   ');
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();
  });

  it('PATCHes a picked status, and reverts it when the save fails', async () => {
    const user = userEvent.setup();
    let fail = false;
    const { calls } = renderApp({
      route: '/admin/feedback',
      me: owner,
      routes: {
        '/api/feedback/': () => (fail ? jsonResponse({ error: 'nope' }, 500) : jsonResponse({ ok: true })),
        '/api/feedback': () => jsonResponse([item()]),
      },
    });
    const trigger = await screen.findByRole('combobox', { name: 'Status' });
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'In progress' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/api/feedback/f1', body: { status: 'in-progress' } });

    fail = true;
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Addressed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("The status didn't save. Try again.");
    expect(trigger).toHaveTextContent('New');
  });
});

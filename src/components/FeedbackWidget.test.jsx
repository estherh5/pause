import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../test/render.jsx';
import { draftKey } from '../lib/form-draft';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));

const member = { state: 'member', email: 'm@example.com', name: null };
beforeEach(() => { window.localStorage.clear(); });

describe('FeedbackWidget', () => {
  it('is bottom-left and only rendered for a member or the owner', async () => {
    const { unmount } = renderApp({ me: member });
    // Wait on the cheap label query; a *ByRole poll costs ~100ms cold here, and
    // under full-suite load one poll alone outlasted the 1s find* budget.
    await screen.findByLabelText('Send feedback');
    expect(screen.getByRole('button', { name: 'Send feedback' })).toHaveClass('pause-feedback-fab');
    unmount();
    renderApp({ me: { state: 'guest', email: 'g@example.com' } });
    await screen.findByText(/Saved plans are by invitation/);
    expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull();
  });

  it('absent when signed out', async () => {
    renderApp({ me: { state: 'signed-out' } });
    await screen.findByRole('button', { name: 'Save' });
    expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull();
  });

  it('sends { type, message, notify } with no screenshotUrl', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp({ me: member, routes: { '/api/feedback': () => jsonResponse({ id: 'f1' }, 201) } });
    await user.click(await screen.findByRole('button', { name: 'Send feedback' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Message'), 'The chart is great');
    await user.click(dialog.getByLabelText("Email me when it's addressed"));
    await user.click(dialog.getByRole('button', { name: 'Send' }));
    await screen.findByText('Thanks. Your note was sent.');
    const post = calls.find((c) => c.path === '/api/feedback' && c.method === 'POST');
    expect(post.body).toMatchObject({ type: 'bug', message: 'The chart is great', notify: true });
    expect(post.body).not.toHaveProperty('screenshotUrl');
    expect(window.localStorage.getItem(draftKey('feedback:new'))).toBeNull();
  });

  it('restores the message from its draft after a remount', async () => {
    const user = userEvent.setup();
    const first = renderApp({ me: member });
    await user.click(await screen.findByRole('button', { name: 'Send feedback' }));
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Message'), 'unfinished thought');
    await new Promise((r) => setTimeout(r, 500)); // the draft saves 400ms after the last keystroke
    first.unmount();
    renderApp({ me: member });
    await user.click(await screen.findByRole('button', { name: 'Send feedback' }));
    expect(await within(screen.getByRole('dialog')).findByDisplayValue('unfinished thought')).toBeInTheDocument();
  });

  it('My submissions teaches when empty', async () => {
    const user = userEvent.setup();
    renderApp({ me: member, routes: { '/api/feedback': () => jsonResponse([]) } });
    await user.click(await screen.findByRole('button', { name: 'Send feedback' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('tab', { name: 'My submissions' }));
    expect(await screen.findByText('Anything you send shows up here, along with the reply.')).toBeInTheDocument();
  });

  it('My submissions failing to load offers Try again, which recovers', async () => {
    const user = userEvent.setup();
    let up = false;
    renderApp({ me: member, routes: { '/api/feedback': () => (up ? jsonResponse([]) : new Response('{}', { status: 500 })) } });
    await user.click(await screen.findByRole('button', { name: 'Send feedback' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('tab', { name: 'My submissions' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your feedback.");
    up = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Anything you send shows up here, along with the reply.')).toBeInTheDocument();
  });
});

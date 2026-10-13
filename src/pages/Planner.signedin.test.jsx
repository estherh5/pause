import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));
const plan = { id: 'p1', name: 'Week', shareId: 'S1S1S1S1S1S1S1S1', timeUnit: 'day', month: null, year: null,
  activities: { 0: [{ id: 0, value: 16, label: '' }, { id: 1, value: 8, label: 'sleep', color: '#ff0000' }, { id: '?', value: '', label: '' }] },
  chartTypes: { 0: 'pie' }, activityCount: 1, createdAt: 1, updatedAt: 1 };

describe('planner when signed in', () => {
  it('signed out: Save still posts anonymously and the modal invites sign-in', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp({ routes: { '/api/pause/activities': () => jsonResponse('ABCDEFGHIJKLMNOP', 201) } });
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(calls.find((c) => c.path === '/api/pause/activities').method).toBe('POST');
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });
  it('guest: Save posts anonymously and the page says saved plans are by invitation', async () => {
    renderApp({ me: { state: 'guest', email: 'g@example.com' } });
    expect(await screen.findByText("Saved plans are by invitation. g@example.com doesn't have one.")).toBeInTheDocument();
  });
  it('member: My plans sits beside Save', async () => {
    renderApp({ me: { state: 'member', email: 'm@example.com', name: null } });
    expect(await screen.findByRole('link', { name: 'My plans' })).toHaveAttribute('href', '/plans');
  });
  it('/?plan=<id> opens the plan, shows its name, and edits mark it unsaved', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/?plan=p1', me: { state: 'member', email: 'm@example.com', name: null }, routes: { '/api/plans/p1': () => jsonResponse(plan) } });
    expect(await screen.findByText('Week')).toBeInTheDocument();
    expect(screen.getByDisplayValue('sleep')).toBeInTheDocument();
    await user.type(screen.getAllByTitle('activity').at(-1), 'walk');
    await user.type(screen.getAllByTitle('hours').at(-1), '1');
    await user.click(screen.getByTitle('Add activity'));
    expect(screen.getByText('· unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Save plan' }));
    expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Week');
    expect(dialog.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Save as new plan' })).toBeInTheDocument();
  });
  it('opening a saved plan never refetches a share link over it', async () => {
    const { calls } = renderApp({ route: '/?plan=p1', me: { state: 'member', email: 'm@example.com', name: null }, routes: { '/api/plans/p1': () => jsonResponse(plan) } });
    expect(await screen.findByDisplayValue('sleep')).toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith('/api/pause/activities'))).toBe(false);
  });
  it("someone else's or a deleted plan id shows the not-found error", async () => {
    renderApp({ route: '/?plan=nope', me: { state: 'member', email: 'm@example.com', name: null }, routes: { '/api/plans/nope': () => jsonResponse({ error: 'not-found' }, 404) } });
    expect(await screen.findByText("That plan isn't in your saved plans.")).toBeInTheDocument();
  });
});

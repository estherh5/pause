import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));
const member = { state: 'member', email: 'm@example.com', name: null };
const stats = {
  empty: false, planCount: 4,
  hours: Array.from({ length: 14 }, (_, i) => ({ label: i === 0 ? 'a very long activity name that must wrap inside its row' : `act ${i}`, hours: 30 - i })),
  plansWithoutActivities: 1,
  months: [{ key: '2026-09', label: 'Sep 2026', count: 3 }, { key: '2026-10', label: 'Oct 2026', count: 0 }],
  mostPlanned: { label: 'sleep', plans: 3 },
};

describe('/stats', () => {
  it('sends the browser time zone', async () => {
    const { calls } = renderApp({ route: '/stats', me: member, routes: { '/api/stats': () => jsonResponse(stats) } });
    await screen.findByText('Hours planned');
    expect(calls.find((c) => c.path.startsWith('/api/stats')).path).toBe(`/api/stats?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
  });
  it('every bar prints its value; top 12 plus a count of the rest; excluded plans stated', async () => {
    renderApp({ route: '/stats', me: member, routes: { '/api/stats': () => jsonResponse(stats) } });
    const hours = await screen.findByRole('list', { name: 'Hours planned' });
    expect(within(hours).getAllByRole('listitem')).toHaveLength(12);
    expect(within(hours).getByText('30 h')).toBeVisible();
    expect(screen.getByText('Plus 2 more activities')).toBeInTheDocument();
    expect(screen.getByText('Plus 1 plan with no activities.')).toBeInTheDocument();
  });
  it('a non-zero bar never prints 0 h: under a quarter hour reads "< 0.25 h"', async () => {
    renderApp({ route: '/stats', me: member, routes: { '/api/stats': () => jsonResponse({ ...stats, hours: [{ label: 'stretch', hours: 30 }, { label: 'blink', hours: 0.1 }] }) } });
    const hours = await screen.findByRole('list', { name: 'Hours planned' });
    const li = within(hours).getByText('blink').closest('li');
    expect(li.querySelector('.stat-fill')).not.toBeNull();
    expect(within(li).getByText('< 0.25 h', { selector: '.stat-value' })).toBeInTheDocument();
  });
  it('a month with no plans shows a real 0', async () => {
    renderApp({ route: '/stats', me: member, routes: { '/api/stats': () => jsonResponse(stats) } });
    const months = await screen.findByRole('list', { name: 'Plans per month' });
    const li = within(months).getByText('Oct 2026').closest('li');
    expect(within(li).getByText('0', { selector: '.stat-value' })).toBeInTheDocument();
    expect(li.querySelector('.stat-fill')).toBeNull();
  });
  it('most planned', async () => {
    renderApp({ route: '/stats', me: member, routes: { '/api/stats': () => jsonResponse(stats) } });
    expect(await screen.findByText('in 3 of 4 plans')).toBeInTheDocument();
  });
  it('absent, not zero: no plans → one sentence and no charts', async () => {
    renderApp({ route: '/stats', me: member, routes: { '/api/stats': () => jsonResponse({ empty: true }) } });
    expect(await screen.findByText('Stats appear once you save a plan.')).toBeInTheDocument();
    expect(screen.queryByText('Hours planned')).toBeNull();
    expect(screen.queryByText(/NaN|—%/)).toBeNull();
  });
  it('plans without any activities: hours and most planned say so, months still render', async () => {
    renderApp({ route: '/stats', me: member, routes: { '/api/stats': () => jsonResponse({ ...stats, hours: [], mostPlanned: null, plansWithoutActivities: 4 }) } });
    expect(await screen.findAllByText('None of your plans has activities yet.')).toHaveLength(2);
    expect(screen.getByRole('list', { name: 'Plans per month' })).toBeInTheDocument();
  });
  it('error with retry', async () => {
    renderApp({ route: '/stats', me: member, routes: { '/api/stats': () => jsonResponse({ error: 'x' }, 500) } });
    expect(await screen.findByText("Stats didn't load.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
  it('guest sees the invitation sentence and no stats request', async () => {
    const { calls } = renderApp({ route: '/stats', me: { state: 'guest', email: 'g@example.com' } });
    expect(await screen.findByText("Saved plans are by invitation. g@example.com doesn't have one.")).toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith('/api/stats'))).toBe(false);
  });

  it('/api/me failing shows Try again instead of a blank page, and recovers', async () => {
    let up = false;
    renderApp({
      route: '/stats',
      routes: {
        '/api/me': () => (up ? jsonResponse({ state: 'signed-out' }) : jsonResponse({ error: 'down' }, 500)),
      },
    });
    expect(await screen.findByText("Couldn't reach Pause.")).toBeInTheDocument();
    up = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Sign in to keep plans by name.')).toBeInTheDocument();
  });
});

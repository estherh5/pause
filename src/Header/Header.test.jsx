import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="chart" />,
  Doughnut: () => <div data-testid="chart" />,
  Pie: () => <div data-testid="chart" />,
  Radar: () => <div data-testid="chart" />,
}));

async function openMenu(user) {
  await user.click(await screen.findByRole('button', { name: /^Apps and/ }));
  return screen.getByRole('dialog', { name: 'Crystal Prism apps and account' });
}

describe('fleet menu rows by sign-in state', () => {
  it('signed out: Sign in → /signin, no Stats', async () => {
    const user = userEvent.setup();
    renderApp({ me: { state: 'signed-out' } });
    const panel = await openMenu(user);
    expect(within(panel).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
    expect(within(panel).queryByRole('link', { name: 'Stats' })).toBeNull();
  });
  it('guest: email and Sign out, no Stats, no Settings', async () => {
    const user = userEvent.setup();
    renderApp({ me: { state: 'guest', email: 'g@example.com' } });
    const panel = await openMenu(user);
    expect(within(panel).getByText('g@example.com')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Stats' })).toBeNull();
  });
  it('member: Stats → /stats, no Settings', async () => {
    const user = userEvent.setup();
    renderApp({ me: { state: 'member', email: 'm@example.com', name: null } });
    const panel = await openMenu(user);
    expect(within(panel).getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/stats');
    expect(within(panel).queryByRole('link', { name: 'Settings' })).toBeNull();
  });
  it('owner: Settings → /settings', async () => {
    const user = userEvent.setup();
    renderApp({ me: { state: 'owner', email: 'hoffman.esther@gmail.com', name: 'Esther' } });
    const panel = await openMenu(user);
    expect(within(panel).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });
});

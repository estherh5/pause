import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));
const member = { state: 'member', email: 'm@example.com', name: null };
const row = (id, name, extra = {}) => ({ id, name, shareId: `SHARE${id}`.padEnd(16, 'x'), timeUnit: 'week', month: null, year: null, activityCount: 3, createdAt: 1, updatedAt: new Date(2026, 9, 12).getTime(), ...extra });

describe('/plans', () => {
  it('lists plans with period, count and saved date', async () => {
    renderApp({ route: '/plans', me: member, routes: { '/api/plans': () => jsonResponse([row('a', 'Week one')]) } });
    // Wait on the row's text, not findByRole('listitem'): the loading skeleton
    // is three listitems too, and a cold *ByRole poll is slow under load.
    const item = (await screen.findByText('Week one')).closest('li');
    expect(screen.getAllByRole('listitem')).toEqual([item]);
    expect(within(item).getByText('Week one')).toBeInTheDocument();
    expect(item).toHaveTextContent('Week · 3 activities · Saved Oct 12, 2026');
    expect(within(item).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/?plan=a');
  });
  it('empty state', async () => {
    renderApp({ route: '/plans', me: member, routes: { '/api/plans': () => jsonResponse([]) } });
    expect(await screen.findByText('No saved plans yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan something' })).toHaveAttribute('href', '/');
  });
  it('error state with retry', async () => {
    const user = userEvent.setup();
    let fail = true;
    renderApp({ route: '/plans', me: member, routes: { '/api/plans': () => (fail ? jsonResponse({ error: 'x' }, 500) : jsonResponse([row('a', 'Back')])) } });
    expect(await screen.findByText("Your plans didn't load.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back')).toBeInTheDocument();
  });
  it('signed out sees the sign-in sentence and button, and no request for plans', async () => {
    const { calls } = renderApp({ route: '/plans' });
    expect(await screen.findByText('Sign in to keep plans by name.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/plans')).toBe(false);
  });
  it('rename: Enter saves, duplicate shows the error inline', async () => {
    const user = userEvent.setup();
    let current = 'Week one';
    renderApp({ route: '/plans', me: member, routes: {
      '/api/plans/a': (_p, init) => {
        const { name } = JSON.parse(init.body);
        if (name === 'Taken') return jsonResponse({ error: 'duplicate-name' }, 409);
        current = name;
        return jsonResponse(row('a', name));
      },
      '/api/plans': () => jsonResponse([row('a', current)]),
    } });
    await user.click(await screen.findByRole('button', { name: 'Rename Week one' }));
    const field = screen.getByRole('textbox', { name: 'Plan name' });
    await user.clear(field);
    await user.type(field, 'Taken{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a plan called "Taken".');
    await user.clear(field);
    await user.type(field, 'Week two{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Week two' })).toHaveFocus());
  });
  it('delete arms, then confirms, and says the share link stops working', async () => {
    const user = userEvent.setup();
    let list = [row('a', 'Week one'), row('b', 'Week two')];
    const { calls } = renderApp({ route: '/plans', me: member, routes: {
      '/api/plans/a': () => { list = list.filter((p) => p.id !== 'a'); return new Response(null, { status: 204 }); },
      '/api/plans': () => jsonResponse(list),
    } });
    await user.click(await screen.findByRole('button', { name: 'Delete Week one' }));
    expect(screen.getByText('Delete "Week one"? Its share link stops working.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open' })).toHaveFocus()); // the next row's Open
    expect(screen.queryByText('Week one')).toBeNull();
  });
  async function deleteFromThree(victim, name) {
    const user = userEvent.setup();
    let list = [row('a', 'Week one'), row('b', 'Week two'), row('c', 'Week three')];
    renderApp({ route: '/plans', me: member, routes: {
      [`/api/plans/${victim}`]: () => { list = list.filter((p) => p.id !== victim); return new Response(null, { status: 204 }); },
      '/api/plans': () => jsonResponse(list),
    } });
    await user.click(await screen.findByRole('button', { name: `Delete ${name}` }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText(name)).toBeNull());
  }
  it('deleting the middle of three focuses the formerly-third row Open link', async () => {
    await deleteFromThree('b', 'Week two');
    const third = screen.getByText('Week three').closest('li');
    await waitFor(() => expect(within(third).getByRole('link', { name: 'Open' })).toHaveFocus());
  });
  it('deleting the last of three focuses the second row Open link', async () => {
    await deleteFromThree('c', 'Week three');
    const second = screen.getByText('Week two').closest('li');
    await waitFor(() => expect(within(second).getByRole('link', { name: 'Open' })).toHaveFocus());
  });
  it('Share copies the link and announces it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderApp({ route: '/plans', me: member, routes: { '/api/plans': () => jsonResponse([row('a', 'Week one')]) } });
    await user.click(await screen.findByRole('button', { name: 'Copy share link for Week one' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?activities=${row('a', '').shareId}`);
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
  it('New plan with unsaved changes asks first; Keep editing keeps them', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/', me: member, routes: { '/api/plans': () => jsonResponse([]) } });
    await user.type(await screen.findByRole('textbox', { name: 'New activity' }), 'sleep');
    await user.type(screen.getByRole('spinbutton', { name: 'Hours for the new activity' }), '8');
    await user.click(screen.getByTitle('Add activity'));
    await user.click(screen.getByRole('link', { name: 'My plans' }));
    await user.click(await screen.findByRole('button', { name: '+ New plan' }));
    expect(screen.getByRole('dialog', { name: 'Start a new plan?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await user.click(screen.getByRole('link', { name: '‹ Pause' }));
    expect(await screen.findByDisplayValue('sleep')).toBeInTheDocument();
  });

  async function dirtyThenPlans(user) {
    renderApp({ route: '/', me: member, routes: { '/api/plans': () => jsonResponse([row('a', 'Week one')]) } });
    await user.type(await screen.findByRole('textbox', { name: 'New activity' }), 'sleep');
    await user.type(screen.getByRole('spinbutton', { name: 'Hours for the new activity' }), '8');
    await user.click(screen.getByTitle('Add activity'));
    await user.click(screen.getByRole('link', { name: 'My plans' }));
  }
  it('Open with unsaved changes asks first; Keep editing stays on /plans and keeps them', async () => {
    const user = userEvent.setup();
    await dirtyThenPlans(user);
    await user.click(await screen.findByRole('link', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Open "Week one"?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('heading', { name: 'My plans' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '‹ Pause' }));
    expect(await screen.findByDisplayValue('sleep')).toBeInTheDocument();
  });
  it('Open with unsaved changes leaves new-tab and new-window clicks to the browser', async () => {
    const user = userEvent.setup();
    await dirtyThenPlans(user);
    const link = await screen.findByRole('link', { name: 'Open' });
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      // fireEvent returns false when a handler called preventDefault.
      expect(fireEvent.click(link, init)).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });
  it('New plan with a clean planner goes to the planner without asking', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/plans', me: member, routes: { '/api/plans': () => jsonResponse([]) } });
    await user.click(await screen.findByRole('button', { name: '+ New plan' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('textbox', { name: 'New activity' })).toBeInTheDocument();
  });
  it('New plan, confirmed, clears the planner', async () => {
    const user = userEvent.setup();
    await dirtyThenPlans(user);
    await user.click(await screen.findByRole('button', { name: '+ New plan' }));
    await user.click(screen.getByRole('button', { name: 'Start new' }));
    expect(await screen.findByRole('textbox', { name: 'New activity' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('sleep')).toBeNull();
  });

  describe('the open plan stays in step with /plans', () => {
    const openPlan = { ...row('p1', 'Week', { timeUnit: 'day' }), activities: { 0: [{ id: 0, value: 16, label: '' }, { id: 1, value: 8, label: 'sleep', color: '#ff0000' }, { id: '?', value: '', label: '' }] }, chartTypes: { 0: 'pie' } };
    async function openThenPlans(user) {
      let name = 'Week';
      let deleted = false;
      const { calls } = renderApp({ route: '/?plan=p1', me: member, routes: {
        '/api/plans/p1': (_p, init) => {
          if (init.method === 'PATCH') { name = JSON.parse(init.body).name; return jsonResponse(row('p1', name)); }
          if (init.method === 'DELETE') { deleted = true; return new Response(null, { status: 204 }); }
          return jsonResponse(openPlan);
        },
        '/api/plans': () => jsonResponse(deleted ? [] : [row('p1', name)]),
      } });
      await screen.findByDisplayValue('sleep');
      await user.click(screen.getByRole('link', { name: 'My plans' }));
      return calls;
    }
    it('renaming the open plan: the planner shows the new name and the next save sends it', async () => {
      const user = userEvent.setup();
      const calls = await openThenPlans(user);
      await user.click(await screen.findByRole('button', { name: 'Rename Week' }));
      const field = screen.getByRole('textbox', { name: 'Plan name' });
      await user.clear(field);
      await user.type(field, 'Renamed{Enter}');
      await screen.findByRole('button', { name: 'Rename Renamed' });
      await user.click(screen.getByRole('link', { name: '‹ Pause' }));
      expect(await screen.findByText('Renamed')).toBeInTheDocument();
      await user.click(await screen.findByRole('button', { name: 'Save' }));
      const dialog = within(screen.getByRole('dialog', { name: 'Save plan' }));
      expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Renamed');
      await user.click(dialog.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').at(-1).body.name).toBe('Renamed'));
      expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
    });
    it('deleting the open plan: the work stays on screen and Save offers a fresh save', async () => {
      const user = userEvent.setup();
      await openThenPlans(user);
      await user.click(await screen.findByRole('button', { name: 'Delete Week' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await screen.findByText('No saved plans yet.');
      await user.click(screen.getByRole('link', { name: '‹ Pause' }));
      expect(await screen.findByDisplayValue('sleep')).toBeInTheDocument();
      await user.click(await screen.findByRole('button', { name: 'Save' }));
      const dialog = within(screen.getByRole('dialog', { name: 'Save plan' }));
      expect(dialog.queryByRole('button', { name: 'Save changes' })).toBeNull();
      expect(dialog.queryByRole('button', { name: 'Save as new plan' })).toBeNull();
    });
    it('deleting the open plan: the orphaned work counts as unsaved, so New plan asks first', async () => {
      const user = userEvent.setup();
      await openThenPlans(user);
      await user.click(await screen.findByRole('button', { name: 'Delete Week' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await screen.findByText('No saved plans yet.');
      await user.click(screen.getByRole('button', { name: '+ New plan' }));
      expect(screen.getByRole('dialog', { name: 'Start a new plan?' })).toBeInTheDocument();
    });
  });
});


import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));
const member = { state: 'member', email: 'm@example.com', name: null };
const summary = (name) => ({ id: 'p1', name, shareId: 'SHARESHARESHARE1', timeUnit: 'day', month: null, year: null, activityCount: 0, createdAt: 1, updatedAt: 1 });

// The page's own Save button stays in the DOM behind the modal (jsdom has no
// inertness), so every query inside the dialog is scoped with within().
async function openDialog(user) {
  await user.click(await screen.findByRole('button', { name: 'Save' }));
  return within(screen.getByRole('dialog', { name: 'Save plan' }));
}

describe('Save dialog', () => {
  it('prefills a default name, selected, and saves it', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp({ me: member, routes: { '/api/plans': (_p, init) => jsonResponse(summary(JSON.parse(init.body).name), 201) } });
    const dialog = await openDialog(user);
    const field = dialog.getByRole('textbox', { name: 'Name' });
    expect(field.value).toMatch(/^Day plan, [A-Z][a-z]{2} \d{1,2}$/);
    await user.clear(field);
    await user.type(field, 'Quiet Sunday');
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('"Quiet Sunday" is in My plans.')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/plans').body).toMatchObject({ name: 'Quiet Sunday', plan: { timeUnit: 'day' } });
  });
  it('blank name: inline error, no request', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp({ me: member });
    const dialog = await openDialog(user);
    await user.clear(dialog.getByRole('textbox', { name: 'Name' }));
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Name the plan.');
    expect(calls.some((c) => c.path === '/api/plans')).toBe(false);
  });
  it('duplicate name from the server keeps the text and says which name', async () => {
    const user = userEvent.setup();
    renderApp({ me: member, routes: { '/api/plans': () => jsonResponse({ error: 'duplicate-name' }, 409) } });
    const dialog = await openDialog(user);
    const field = dialog.getByRole('textbox', { name: 'Name' });
    await user.clear(field);
    await user.type(field, 'Week');
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('You already have a plan called "Week".');
    expect(field).toHaveValue('Week');
  });
  it('network failure says so', async () => {
    const user = userEvent.setup();
    renderApp({ me: member, routes: { '/api/plans': () => { throw new TypeError('offline'); } } });
    const dialog = await openDialog(user);
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent("The plan didn't save. Check your connection and try again.");
  });
  it('a double click creates one request', async () => {
    const user = userEvent.setup();
    let resolve;
    const { calls } = renderApp({ me: member, routes: { '/api/plans': () => new Promise((r) => { resolve = () => r(jsonResponse(summary('x'), 201)); }) } });
    const dialog = await openDialog(user);
    await user.dblClick(dialog.getByRole('button', { name: 'Save' }));
    expect(calls.filter((c) => c.path === '/api/plans')).toHaveLength(1);
    expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    resolve();
  });

  describe('editing a saved plan', () => {
    const openPlan = { ...summary('Week'), activities: { 0: [{ id: 0, value: 16, label: '' }, { id: 1, value: 8, label: 'sleep', color: '#ff0000' }, { id: '?', value: '', label: '' }] }, chartTypes: { 0: 'pie' } };
    async function openSaved(user, patch) {
      const r = renderApp({ route: '/?plan=p1', me: member, routes: {
        '/api/plans/p1': (_p, init) => (init.method === 'PATCH' ? patch(init) : jsonResponse(openPlan)),
        '/api/plans': (_p, init) => jsonResponse(summary(JSON.parse(init.body).name), 201),
      } });
      await screen.findByDisplayValue('sleep');
      await user.click(await screen.findByRole('button', { name: 'Save' }));
      return { ...r, dialog: within(screen.getByRole('dialog', { name: 'Save plan' })) };
    }
    it('Save changes PATCHes the open plan with name and plan', async () => {
      const user = userEvent.setup();
      const { calls, dialog } = await openSaved(user, (init) => jsonResponse(summary(JSON.parse(init.body).name)));
      await user.click(dialog.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText('"Week" is in My plans.')).toBeInTheDocument();
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(patch.path).toBe('/api/plans/p1');
      expect(patch.body).toMatchObject({ name: 'Week', plan: { timeUnit: 'day' } });
    });
    it('Save as new plan POSTs instead of patching', async () => {
      const user = userEvent.setup();
      const { calls, dialog } = await openSaved(user, () => jsonResponse({}, 500));
      await user.click(dialog.getByRole('button', { name: 'Save as new plan' }));
      expect(await screen.findByText('"Week" is in My plans.')).toBeInTheDocument();
      expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
      expect(calls.find((c) => c.path === '/api/plans' && c.method === 'POST').body).toMatchObject({ name: 'Week' });
    });
    it('a 404 on update says the plan was deleted, not "check your connection"', async () => {
      const user = userEvent.setup();
      const { dialog } = await openSaved(user, () => jsonResponse({ error: 'not-found' }, 404));
      await user.click(dialog.getByRole('button', { name: 'Save changes' }));
      expect(await dialog.findByRole('alert')).toHaveTextContent('This plan was deleted. Save it as a new plan.');
    });
  });
});

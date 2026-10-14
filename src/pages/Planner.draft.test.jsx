import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftKey, parseDraft, serializeDraft } from '../lib/form-draft';
import { createInitialSchedule, scheduleKey } from '../lib/schedule.js';
import { jsonResponse, renderApp } from '../test/render.jsx';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Doughnut: () => null, Pie: () => null, Radar: () => null }));

const member = { state: 'member', email: 'm@example.com', name: null };
const stored = (scope) => parseDraft(window.localStorage.getItem(draftKey(scope)));
const storedSchedule = (scope) => JSON.parse(stored(scope).fields.schedule);
const seed = (scope, schedule) =>
  window.localStorage.setItem(draftKey(scope), serializeDraft({ schedule: scheduleKey(schedule) }, Date.now() - 60_000));
const sleepPlan = () => ({
  ...createInitialSchedule(),
  activities: { 0: [{ id: 0, value: 16, label: '' }, { id: 1, value: 8, label: 'sleep', color: '#ff0000' }, { id: '?', value: '', label: '' }] },
});
const share = { activities: { 0: [{ id: 0, value: 24, label: '', color: '#DCDCDC' }, { id: '?', value: '', label: '' }] },
  chart_types: { 0: 'pie' }, time_unit: 'day', month: null, year: null, name: null };

async function pickWeek(user) {
  await user.click(screen.getByRole('combobox', { name: 'Toggle time period' }));
  await user.click(screen.getByRole('option', { name: 'week' }));
}
const timeUnit = () => screen.getByRole('combobox', { name: 'Toggle time period' });

afterEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('planner drafts', () => {
  it('a blank-start plan comes back after a reload, without asking', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await pickWeek(user);
    await waitFor(() => expect(storedSchedule('plan:new').timeUnit).toBe('week'));
    first.unmount();

    renderApp();
    expect(timeUnit()).toHaveTextContent('week');
    expect(screen.getByText(/kept what you had written/)).toBeInTheDocument();
  });

  it('a share link shows its own plan and only offers the draft', async () => {
    const user = userEvent.setup();
    seed('share:abc', { ...createInitialSchedule(), timeUnit: 'week', activities: {}, chartTypes: {} });
    window.history.pushState({}, '', '/?activities=abc');
    renderApp({ route: '/?activities=abc', routes: { '/api/pause/activities/abc': () => jsonResponse(share) } });

    const restore = await screen.findByRole('button', { name: 'restore' });
    expect(timeUnit()).toHaveTextContent('day');
    await user.click(restore);
    expect(timeUnit()).toHaveTextContent('week');
  });

  it('a blank-start draft is never applied over a share link', async () => {
    seed('plan:new', { ...createInitialSchedule(), timeUnit: 'week', activities: {}, chartTypes: {} });
    window.history.pushState({}, '', '/?activities=abc');
    const { calls } = renderApp({ route: '/?activities=abc', routes: { '/api/pause/activities/abc': () => jsonResponse(share) } });
    await waitFor(() => expect(calls.some((c) => c.path === '/api/pause/activities/abc')).toBe(true));
    expect(timeUnit()).toHaveTextContent('day');
    expect(screen.queryByText(/kept what you had written/)).not.toBeInTheDocument();
  });

  it('while a link is still loading, the blank-start draft stays put', async () => {
    seed('plan:new', { ...createInitialSchedule(), timeUnit: 'week', activities: {}, chartTypes: {} });
    window.history.pushState({}, '', '/?activities=abc');
    const { calls } = renderApp({ route: '/?activities=abc', routes: { '/api/pause/activities/abc': () => new Promise(() => {}) } });
    await waitFor(() => expect(calls.some((c) => c.path === '/api/pause/activities/abc')).toBe(true));
    expect(timeUnit()).toHaveTextContent('day');
    expect(screen.queryByText(/kept what you had written/)).not.toBeInTheDocument();
    expect(stored('plan:new')).not.toBeNull();
  });

  it('loading a link does not save the linked plan as a draft of itself', async () => {
    window.history.pushState({}, '', '/?activities=abc');
    const { calls } = renderApp({ route: '/?activities=abc', routes: { '/api/pause/activities/abc': () => jsonResponse(share) } });
    await waitFor(() => expect(calls.some((c) => c.path === '/api/pause/activities/abc')).toBe(true));
    // Past the hook's 400ms save debounce.
    await new Promise((r) => { setTimeout(r, 500); });
    expect(window.localStorage.getItem(draftKey('share:abc'))).toBeNull();
    expect(window.localStorage.getItem(draftKey('plan:opening'))).toBeNull();
  });

  it('a saved plan opened from ?plan= offers its draft rather than applying it', async () => {
    const plan = { id: 'p1', name: 'Week', shareId: 'S1', activityCount: 1, createdAt: 1, updatedAt: 1, ...sleepPlan() };
    seed('plan:p1', { ...sleepPlan(), timeUnit: 'week', activities: {}, chartTypes: {} });
    renderApp({ route: '/?plan=p1', me: member, routes: { '/api/plans/p1': () => jsonResponse(plan) } });
    expect(await screen.findByDisplayValue('sleep')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'restore' })).toBeInTheDocument();
    expect(timeUnit()).toHaveTextContent('day');
  });

  it('saving the plan clears its draft', async () => {
    const user = userEvent.setup();
    renderApp({
      me: member,
      routes: { '/api/plans': () => jsonResponse({ id: 'p9', name: 'Mine', shareId: 'S9' }, 201) },
    });
    await screen.findByRole('link', { name: 'My plans' });
    await pickWeek(user);
    await waitFor(() => expect(stored('plan:new')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Save plan' }));
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    await screen.findByText('"Mine" is in My plans.');
    expect(window.localStorage.getItem(draftKey('plan:new'))).toBeNull();
    // The saved plan starts clean: nothing waiting under its own scope either.
    await new Promise((r) => { setTimeout(r, 500); });
    expect(window.localStorage.getItem(draftKey('plan:p9'))).toBeNull();
  });

  it('starting a new plan from the + button clears the draft', async () => {
    const user = userEvent.setup();
    renderApp({ me: member, routes: { '/api/plans': () => jsonResponse([]) } });
    await pickWeek(user);
    await waitFor(() => expect(stored('plan:new')).not.toBeNull());
    // Text and label waits, not *ByRole: under full-suite load a cold role
    // poll ran longer than the 1s find* budget while /plans loaded.
    await user.click(await screen.findByText('My plans'));
    await user.click(await screen.findByText('+ New plan'));
    await user.click(await screen.findByText('Start new'));
    expect(await screen.findByLabelText('Toggle time period')).toHaveTextContent('day');
    expect(window.localStorage.getItem(draftKey('plan:new'))).toBeNull();
  });
});

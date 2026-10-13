import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlannerProvider } from '../lib/planner-context.jsx';
import { jsonResponse, renderApp } from '../test/render.jsx';
import Planner from './Planner.jsx';

vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="chart" />,
  Doughnut: () => <div data-testid="chart" />,
  Pie: () => <div data-testid="chart" />,
  Radar: () => <div data-testid="chart" />,
}));

describe('App', () => {
  it('switches between day and week schedules', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('combobox', { name: 'Toggle time period' }));
    await user.click(screen.getByRole('option', { name: 'week' }));

    expect(screen.getByText('Sunday')).toBeInTheDocument();
    expect(screen.getByText('Saturday')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart')).toHaveLength(7);
  });

  it('the time unit control is keyboard-operable', async () => {
    const user = userEvent.setup();
    renderApp();
    const box = screen.getByRole('combobox', { name: 'Toggle time period' });
    box.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(await screen.findByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });

  it('adds an activity and updates the remaining hours', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByTitle('activity'), 'sleep');
    await user.type(screen.getByTitle('hours'), '8');
    await user.click(screen.getByTitle('Add activity'));

    expect(screen.getAllByDisplayValue('sleep')).toHaveLength(1);
    expect(screen.getByDisplayValue('8')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('validates schedules longer than 24 hours', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByTitle('activity'), 'sleep');
    await user.type(screen.getByTitle('hours'), '25');
    await user.click(screen.getByTitle('Add activity'));

    expect(
      screen.getByText('There aren\'t enough hours in the day!'),
    ).toBeInTheDocument();
  });

  it('shows calculator totals for a selected age range', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByTitle('Professional activities'));

    fireEvent.blur(screen.getByTitle('Enter your age'), {
      target: { value: '30' },
    });
    fireEvent.blur(screen.getByTitle('Enter the age you would like to live to'), {
      target: { value: '31' },
    });

    const sleepRow = screen.getByText('sleep').closest('tr');
    expect(sleepRow).toHaveTextContent('2,920 hours on sleep');
  });
});

describe('Planner share loading across remounts', () => {
  const share = (name) => ({
    activities: { 0: [{ id: 0, value: 24, label: '', color: '#DCDCDC' }, { id: '?', value: '', label: '' }] },
    chart_types: { 0: 'pie' }, time_unit: 'day', month: null, year: null, name,
  });
  function Harness() {
    const [shown, setShown] = useState(true);
    return (
      <PlannerProvider>
        <button onClick={() => setShown((v) => !v)}>toggle</button>
        {shown && <Planner />}
      </PlannerProvider>
    );
  }
  function setup() {
    const fetchMock = vi.fn(async (url) => jsonResponse(share(String(url).split('/').pop())));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  afterEach(() => window.history.pushState({}, '', '/'));

  it('loads the shared plan from the URL id', async () => {
    const fetchMock = setup();
    window.history.pushState({}, '', '/?activities=abc');
    render(<Harness />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/pause/activities/abc');
  });

  it('does not refetch over edits when remounted with the same id', async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    window.history.pushState({}, '', '/?activities=abc');
    render(<Harness />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('combobox', { name: 'Toggle time period' }));
    await user.click(screen.getByRole('option', { name: 'week' }));
    await user.click(screen.getByText('toggle'));
    await user.click(screen.getByText('toggle'));
    expect(screen.getByRole('combobox', { name: 'Toggle time period' })).toHaveTextContent('week');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loads again when the URL carries a different id', async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    window.history.pushState({}, '', '/?activities=abc');
    render(<Harness />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByText('toggle'));
    window.history.pushState({}, '', '/?activities=xyz');
    await user.click(screen.getByText('toggle'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/pause/activities/xyz');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="chart" />,
  Doughnut: () => <div data-testid="chart" />,
  Pie: () => <div data-testid="chart" />,
  Radar: () => <div data-testid="chart" />,
}));

describe('App', () => {
  it('switches between day and week schedules', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByTitle('Toggle time period'), 'week');

    expect(screen.getByText('Sunday')).toBeInTheDocument();
    expect(screen.getByText('Saturday')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart')).toHaveLength(7);
  });

  it('adds an activity and updates the remaining hours', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByTitle('activity'), 'sleep');
    await user.type(screen.getByTitle('hours'), '8');
    await user.click(screen.getByTitle('Add activity'));

    expect(screen.getAllByDisplayValue('sleep')).toHaveLength(1);
    expect(screen.getByDisplayValue('8')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('validates schedules longer than 24 hours', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByTitle('activity'), 'sleep');
    await user.type(screen.getByTitle('hours'), '25');
    await user.click(screen.getByTitle('Add activity'));

    expect(
      screen.getByText('There aren\'t enough hours in the day!'),
    ).toBeInTheDocument();
  });

  it('shows calculator totals for a selected age range', async () => {
    const user = userEvent.setup();
    render(<App />);
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

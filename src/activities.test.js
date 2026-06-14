import { describe, expect, it, vi } from 'vitest';
import {
  addActivityColors,
  createPeriodState,
  createStartingActivities,
  getDaysInMonth,
} from './activities.js';

describe('activity helpers', () => {
  it('creates independent activity arrays for each day', () => {
    const period = createPeriodState(2);

    period.activities[0][0].value = 12;

    expect(period.activities[1]).toEqual(createStartingActivities());
    expect(period.chartTypes).toEqual({ 0: 'pie', 1: 'pie' });
  });

  it('handles leap years', () => {
    expect(getDaysInMonth(2024, 1)).toBe(29);
    expect(getDaysInMonth(2025, 1)).toBe(28);
  });

  it('colors activities without relying on their numeric IDs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const activities = addActivityColors([
      { id: 0, value: 20, label: '', color: '#DCDCDC' },
      { id: 2, value: 2, label: 'read' },
      { id: 9, value: 2, label: 'walk' },
      { id: '?', value: '', label: '' },
    ]);

    expect(activities[1].color).toMatch(/^#/);
    expect(activities[2].color).toMatch(/^#/);
    expect(activities[0].color).toBe('#DCDCDC');
    vi.restoreAllMocks();
  });
});

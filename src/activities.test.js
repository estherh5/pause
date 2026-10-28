import { describe, expect, it, vi } from 'vitest';
import {
  addActivityColors,
  colorPlan,
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

  const day = (...labels) => [
    { id: 0, value: 10, label: '', color: '#DCDCDC' },
    ...labels.map((label, i) => ({ id: i + 1, value: 2, label })),
    { id: '?', value: '', label: '' },
  ];
  const colorsOf = (activities) => Object.fromEntries(activities.filter((a) => a.label).map((a) => [a.label.trim().toLowerCase(), a.color]));

  it('gives one label one color on every day of a plan, ignoring case and spaces', () => {
    const plan = colorPlan({ 0: day('Sleep', 'work'), 1: day(' sleep', 'Gym'), 2: day('WORK') });
    expect(colorsOf(plan[1]).sleep).toBe(colorsOf(plan[0]).sleep);
    expect(colorsOf(plan[2]).work).toBe(colorsOf(plan[0]).work);
    expect(new Set(Object.values({ ...colorsOf(plan[0]), ...colorsOf(plan[1]) })).size).toBe(3);
  });

  it('is deterministic: the same labels get the same colors on every run (starters, reloads)', () => {
    const a = addActivityColors(day('Sleep', 'Work', 'Read'));
    const b = addActivityColors(day('Sleep', 'Work', 'Read'));
    expect(a.map((x) => x.color)).toEqual(b.map((x) => x.color));
  });

  it('an edit keeps existing colors and takes the plan color for a known label', () => {
    const plan = colorPlan({ 0: day('Sleep', 'Work') });
    const sleep = colorsOf(plan[0]).sleep;
    const edited = addActivityColors([...plan[0].slice(0, 3), { id: 3, value: 1, label: 'Read' }, plan[0][3]], new Map([['sleep', sleep]]));
    expect(colorsOf(edited).sleep).toBe(sleep);
    expect(colorsOf(edited).work).toBe(colorsOf(plan[0]).work);
    expect(colorsOf(edited).read).not.toBe(sleep);
  });

  it('a renamed row never takes over another label\'s color', () => {
    const plan = colorPlan({ 0: day('Sleep', 'Work'), 1: day('Work') });
    const work = colorsOf(plan[0]).work;
    const renamed = plan[1].map((a) => (a.label === 'Work' ? { ...a, label: 'Gym' } : a));
    const recolored = addActivityColors(renamed, new Map([['sleep', colorsOf(plan[0]).sleep], ['work', work]]));
    expect(colorsOf(recolored).gym).not.toBe(work);
  });

  it('unifies a plan saved with a different color per day', () => {
    const saved = { 0: day('Sleep').map((a) => (a.label ? { ...a, color: '#ff0000' } : a)), 1: day('Sleep').map((a) => (a.label ? { ...a, color: '#0000ff' } : a)) };
    const plan = colorPlan(saved);
    expect(colorsOf(plan[0]).sleep).toBe('#ff0000');
    expect(colorsOf(plan[1]).sleep).toBe('#ff0000');
  });
});

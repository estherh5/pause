import { describe, expect, it } from 'vitest';
import { createInitialSchedule, planToSchedule, scheduleKey, scheduleToPayload, shareToSchedule } from './schedule.js';

describe('schedule helpers', () => {
  it('initial schedule is today\'s App.jsx initialState', () => {
    expect(createInitialSchedule()).toEqual({
      activities: { 0: [{ id: 0, value: 24, label: '', color: '#DCDCDC' }, { id: '?', value: '', label: '' }] },
      chartTypes: { 0: 'pie' }, timeUnit: 'day', month: null, year: null,
    });
  });
  it('maps the share wire format and the plans API back to the same schedule', () => {
    const s = { activities: { 0: [] }, chartTypes: { 0: 'bar' }, timeUnit: 'month', month: 'May', year: 2026 };
    expect(shareToSchedule({ activities: s.activities, chart_types: s.chartTypes, time_unit: 'month', month: 'May', year: 2026, name: 'x' })).toEqual(s);
    expect(planToSchedule({ ...s, id: 'p', name: 'x' })).toEqual(s);
    expect(scheduleToPayload(s)).toEqual(s);
  });
  it('scheduleKey changes when an activity changes and not otherwise', () => {
    const a = createInitialSchedule();
    expect(scheduleKey(a)).toBe(scheduleKey(createInitialSchedule()));
    expect(scheduleKey({ ...a, timeUnit: 'week' })).not.toBe(scheduleKey(a));
  });
});

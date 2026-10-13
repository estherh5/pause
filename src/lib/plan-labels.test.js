import { describe, expect, it } from 'vitest';
import { activityCountLabel, defaultPlanName, periodLabel, savedOnLabel } from './plan-labels.js';

const oct13 = new Date(2026, 9, 13, 9);
describe('plan labels', () => {
  it('default names', () => {
    expect(defaultPlanName('day', null, null, oct13)).toBe('Day plan, Oct 13');
    expect(defaultPlanName('week', null, null, oct13)).toBe('Week plan, Oct 13');
    expect(defaultPlanName('month', 'October', 2026, oct13)).toBe('October 2026');
  });
  it('period, count and saved-on labels', () => {
    expect(periodLabel({ timeUnit: 'day' })).toBe('Day');
    expect(periodLabel({ timeUnit: 'month', month: 'May', year: 2026 })).toBe('May 2026');
    expect(activityCountLabel(0)).toBe('No activities');
    expect(activityCountLabel(1)).toBe('1 activity');
    expect(activityCountLabel(5)).toBe('5 activities');
    expect(savedOnLabel(new Date(2026, 9, 12, 23).getTime())).toBe('Saved Oct 12, 2026');
  });
});

import { addActivityColors, createStartingActivities } from '../activities.js';

export function createInitialSchedule() {
  return { activities: { 0: createStartingActivities() }, chartTypes: { 0: 'pie' }, timeUnit: 'day', month: null, year: null };
}
export const scheduleToPayload = (s) => ({ activities: s.activities, chartTypes: s.chartTypes, timeUnit: s.timeUnit, month: s.month, year: s.year });
// A stored day whose activities carry no colors (older rows) would draw an
// all-black chart and an empty key; give it the planner's own colors.
const withColors = (activities) => Object.fromEntries(Object.entries(activities ?? {}).map(([id, day]) => [
  id,
  day.some((a) => !['?', 0].includes(a.id) && !a.color) ? addActivityColors(day) : day,
]));
export const shareToSchedule = (d) => ({ activities: withColors(d.activities), chartTypes: d.chart_types, timeUnit: d.time_unit, month: d.month, year: d.year });
export const planToSchedule = (p) => ({ activities: withColors(p.activities), chartTypes: p.chartTypes, timeUnit: p.timeUnit, month: p.month, year: p.year });
export const scheduleKey = (s) => JSON.stringify(scheduleToPayload(s));

import { colorPlan, createStartingActivities } from '../activities.js';

export function createInitialSchedule() {
  return { activities: { 0: createStartingActivities() }, chartTypes: { 0: 'pie' }, timeUnit: 'day', month: null, year: null };
}
export const scheduleToPayload = (s) => ({ activities: s.activities, chartTypes: s.chartTypes, timeUnit: s.timeUnit, month: s.month, year: s.year });
// One color per label across the plan: older rows carry no colors (an
// all-black chart) and plans saved before colors were plan-wide carry a
// different color per day.
const withColors = (activities) => colorPlan(activities ?? {});
export const shareToSchedule = (d) => ({ activities: withColors(d.activities), chartTypes: d.chart_types, timeUnit: d.time_unit, month: d.month, year: d.year });
export const planToSchedule = (p) => ({ activities: withColors(p.activities), chartTypes: p.chartTypes, timeUnit: p.timeUnit, month: p.month, year: p.year });
export const scheduleKey = (s) => JSON.stringify(scheduleToPayload(s));

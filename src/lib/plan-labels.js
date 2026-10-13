const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d) => `${MON[d.getMonth()]} ${d.getDate()}`;

export function defaultPlanName(timeUnit, month, year, today = new Date()) {
  if (timeUnit === 'month') return `${month} ${year}`;
  return `${timeUnit === 'week' ? 'Week' : 'Day'} plan, ${short(today)}`;
}
export const periodLabel = ({ timeUnit, month, year }) =>
  (timeUnit === 'month' ? `${month} ${year}` : timeUnit === 'week' ? 'Week' : 'Day');
export const activityCountLabel = (n) => (n === 0 ? 'No activities' : n === 1 ? '1 activity' : `${n} activities`);
export function savedOnLabel(ms) {
  const d = new Date(ms);
  return `Saved ${short(d)}, ${d.getFullYear()}`;
}

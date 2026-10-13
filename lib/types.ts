export type ChartType = 'pie' | 'bar' | 'radar' | 'doughnut';
export type TimeUnit = 'day' | 'week' | 'month';
/** One row of a day's table, exactly as src/activities.js builds it.
 *  id 0 = the unplanned remainder row; id '?' = the empty entry row. */
export interface Activity {
  id: number | string;
  value: number | string;
  label: string;
  color?: string;
  errorMessage?: string;
}
export interface PlanPayload {
  activities: Record<string, Activity[]>;
  chartTypes: Record<string, ChartType>;
  timeUnit: TimeUnit;
  month: string | null;
  year: number | null;
}

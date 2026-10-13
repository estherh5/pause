import type { VercelRequest } from './vercel.js';
import type { Activity, PlanPayload } from './types.js';

export const MAX_BODY_BYTES = 64 * 1024;
const TIME_UNITS = new Set(['day', 'week', 'month']);
const isDict = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Port of pause_api/pause/pause.py#validate_payload, same messages. */
export function validatePlanPayload(data: unknown): string | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || !('activities' in d) || !('chartTypes' in d) || !('timeUnit' in d)) {
    return 'Request must contain activities and time unit';
  }
  if (!isDict(d.activities)) return 'Activities must be a dictionary';
  if (!isDict(d.chartTypes)) return 'Chart types must be a dictionary';
  if (typeof d.timeUnit !== 'string') return 'Time unit must be a string';
  if (!TIME_UNITS.has(d.timeUnit)) return 'Time unit must be day, week, or month';
  if (d.timeUnit === 'month' && (typeof d.month !== 'string' || !Number.isInteger(d.year))) {
    return 'Month data must contain a month and year';
  }
  return null;
}

export function normalizePlanPayload(data: PlanPayload): PlanPayload {
  const activities: Record<string, Activity[]> = {};
  for (const [day, rows] of Object.entries(data.activities)) {
    activities[day] = (Array.isArray(rows) ? rows : []).map(({ errorMessage: _e, ...a }) => a);
  }
  const isMonth = data.timeUnit === 'month';
  return {
    activities,
    chartTypes: data.chartTypes,
    timeUnit: data.timeUnit,
    month: isMonth ? data.month : null,
    year: isMonth ? data.year : null,
  };
}

export function exceedsBodyCap(req: VercelRequest): boolean {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) return true;
  try {
    return Buffer.byteLength(JSON.stringify(req.body ?? null)) > MAX_BODY_BYTES;
  } catch {
    return true;
  }
}

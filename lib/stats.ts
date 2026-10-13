import { eq } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { plans } from '../db/schema.js';

export const MONTHS_SHOWN = 12;
const ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type PauseStats =
  | { empty: true }
  | {
      empty: false;
      planCount: number;
      hours: { label: string; hours: number }[];
      plansWithoutActivities: number;
      months: { key: string; label: string; count: number }[];
      mostPlanned: { label: string; plans: number } | null;
    };

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** The LOCAL calendar month of an instant in `timeZone` (never the server's UTC). */
export function monthKey(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return `${y}-${m}`;
}
const nextKey = (key: string) => {
  let [y, m] = key.split('-').map(Number);
  m += 1; if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
const labelOf = (key: string) => { const [y, m] = key.split('-'); return `${ABBR[Number(m) - 1]} ${y}`; };

export async function getPauseStats(db: DB, email: string, clock: { now: number; timeZone: string }): Promise<PauseStats> {
  const rows = await db.select({ activities: plans.activities, createdAt: plans.createdAt })
    .from(plans).where(eq(plans.ownerEmail, email.trim().toLowerCase()));
  if (rows.length === 0) return { empty: true };

  const hours = new Map<string, { label: string; hours: number }>();
  const inPlans = new Map<string, number>();
  const perMonth = new Map<string, number>();
  let plansWithoutActivities = 0;
  let first: string | null = null;

  for (const r of rows) {
    const seen = new Set<string>();
    for (const day of Object.values(r.activities ?? {})) {
      for (const a of day ?? []) {
        if (a.id === 0 || a.id === '?') continue;
        const label = String(a.label ?? '').trim();
        const value = Number(a.value);
        if (!label || !Number.isFinite(value)) continue;
        const key = label.toLowerCase();
        const e = hours.get(key);
        if (e) e.hours += value; else hours.set(key, { label, hours: value });
        seen.add(key);
      }
    }
    if (seen.size === 0) plansWithoutActivities += 1;
    for (const k of seen) inPlans.set(k, (inPlans.get(k) ?? 0) + 1);
    const mk = monthKey(r.createdAt, clock.timeZone);
    perMonth.set(mk, (perMonth.get(mk) ?? 0) + 1);
    if (first === null || mk < first) first = mk;
  }

  const current = monthKey(clock.now, clock.timeZone);
  const months: { key: string; label: string; count: number }[] = [];
  for (let k = first as string; k <= current; k = nextKey(k)) months.push({ key: k, label: labelOf(k), count: perMonth.get(k) ?? 0 });

  const ranked = [...inPlans.entries()].sort((a, b) =>
    b[1] - a[1] || (hours.get(b[0])!.hours - hours.get(a[0])!.hours) || a[0].localeCompare(b[0]));

  return {
    empty: false,
    planCount: rows.length,
    hours: [...hours.values()].sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label)),
    plansWithoutActivities,
    months: months.slice(-MONTHS_SHOWN),
    mostPlanned: ranked.length ? { label: hours.get(ranked[0][0])!.label, plans: ranked[0][1] } : null,
  };
}

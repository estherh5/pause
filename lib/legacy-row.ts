import type { plans } from '../db/schema.js';

export interface NeonActivitiesRow {
  id: number; external_id: string; activities: unknown; chart_types: unknown;
  time_unit: string; month: string | null; year: number | null; created: string | null;
}

/**
 * Rows created by the original API stored JSON strings inside JSON columns
 * (pause.py). Some were encoded twice, so decode until it is no longer a string.
 */
export const decodeJsonValue = (v: unknown): unknown => {
  let out = v;
  for (let i = 0; i < 4 && typeof out === 'string'; i++) out = JSON.parse(out);
  return out;
};

/** Neon `created` is a naive UTC timestamp (pause_api writes datetime.now(timezone.utc) without tzinfo). */
export function legacyCreatedMs(created: string | null, fallbackMs: number): number {
  if (!created) return fallbackMs;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(created) ? created : `${created.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : fallbackMs;
}

export function legacyRowToPlan(row: NeonActivitiesRow, nowMs: number): typeof plans.$inferInsert {
  const createdAt = legacyCreatedMs(row.created, nowMs);
  return {
    id: `legacy-${row.id}`,
    shareId: row.external_id,
    ownerEmail: null, name: null, nameKey: null,
    activities: decodeJsonValue(row.activities) as never,
    chartTypes: decodeJsonValue(row.chart_types) as never,
    timeUnit: row.time_unit,
    month: row.month, year: row.year,
    source: 'legacy',
    createdAt, updatedAt: createdAt,
  };
}

export function diffShareIds(neonIds: string[], tursoIds: string[]): { missing: string[]; extra: string[] } {
  const t = new Set(tursoIds); const n = new Set(neonIds);
  return { missing: neonIds.filter((i) => !t.has(i)).sort(), extra: tursoIds.filter((i) => !n.has(i)).sort() };
}

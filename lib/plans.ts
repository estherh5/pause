import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { plans, type PlanRow } from '../db/schema.js';
import { newShareId } from './share-id.js';
import type { Activity, PlanPayload } from './types.js';

export const ANON_CREATE_LIMIT = 10;
export const ANON_CREATE_WINDOW_MS = 60 * 60 * 1000;
export const PLAN_LIMIT = 500;

export interface ShareView {
  activities: PlanPayload['activities']; chart_types: PlanPayload['chartTypes'];
  time_unit: string; month: string | null; year: number | null; name: string | null;
}
export interface PlanSummary {
  id: string; name: string; shareId: string; timeUnit: string; month: string | null; year: number | null;
  activityCount: number; createdAt: number; updatedAt: number;
}
export interface PlanDetail extends PlanSummary {
  activities: PlanPayload['activities']; chartTypes: PlanPayload['chartTypes'];
}
type Name = { name: string; key: string };

const lower = (e: string) => e.trim().toLowerCase();
const isEntryOrRemainder = (a: Activity) => a.id === 0 || a.id === '?';

export function countActivities(activities: Record<string, Activity[]>): number {
  const labels = new Set<string>();
  for (const rows of Object.values(activities ?? {})) {
    for (const a of rows ?? []) {
      const label = String(a.label ?? '').trim().toLowerCase();
      if (!isEntryOrRemainder(a) && label) labels.add(label);
    }
  }
  return labels.size;
}

const toSummary = (r: PlanRow): PlanSummary => ({
  id: r.id, name: r.name ?? '', shareId: r.shareId, timeUnit: r.timeUnit, month: r.month, year: r.year,
  activityCount: countActivities(r.activities), createdAt: r.createdAt, updatedAt: r.updatedAt,
});

// drizzle-orm wraps libsql errors in DrizzleQueryError; the driver's text is on `cause`.
const errMessage = (e: unknown) => String((e as { cause?: { message?: string }; message?: string })?.cause?.message ?? (e as Error)?.message ?? e);
const isUniqueViolation = (e: unknown) => /UNIQUE constraint failed/.test(errMessage(e));

async function uniqueShareId(db: DB): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const id = newShareId();
    const [hit] = await db.select({ id: plans.id }).from(plans).where(eq(plans.shareId, id)).limit(1);
    if (!hit) return id;
  }
  throw new Error('could not allocate a unique share id');
}

export async function createAnonymousPlan(db: DB, payload: PlanPayload, now: number): Promise<{ shareId: string } | { error: 'rate-limited' }> {
  // Global, counted from the DB: holds across function instances and stores nothing about who posted.
  const [{ n }] = await db.select({ n: count() }).from(plans)
    .where(and(isNull(plans.ownerEmail), gt(plans.createdAt, now - ANON_CREATE_WINDOW_MS)));
  if (n >= ANON_CREATE_LIMIT) return { error: 'rate-limited' };
  const shareId = await uniqueShareId(db);
  await db.insert(plans).values({ id: randomUUID(), shareId, ...payload, createdAt: now, updatedAt: now });
  return { shareId };
}

export async function readShare(db: DB, shareId: string): Promise<ShareView | null> {
  const [r] = await db.select().from(plans).where(eq(plans.shareId, shareId)).limit(1);
  if (!r) return null;
  return { activities: r.activities, chart_types: r.chartTypes, time_unit: r.timeUnit, month: r.month, year: r.year, name: r.name };
}

export async function listPlans(db: DB, email: string): Promise<PlanSummary[]> {
  const rows = await db.select().from(plans).where(eq(plans.ownerEmail, lower(email))).orderBy(desc(plans.updatedAt));
  return rows.map(toSummary);
}

export async function getPlan(db: DB, email: string, id: string): Promise<PlanDetail | null> {
  const [r] = await db.select().from(plans).where(and(eq(plans.id, id), eq(plans.ownerEmail, lower(email)))).limit(1);
  return r ? { ...toSummary(r), activities: r.activities, chartTypes: r.chartTypes } : null;
}

export async function createPlan(db: DB, email: string, name: Name, payload: PlanPayload, now: number): Promise<PlanSummary | { error: 'duplicate-name' | 'plan-limit' }> {
  const owner = lower(email);
  const [{ n }] = await db.select({ n: count() }).from(plans).where(eq(plans.ownerEmail, owner));
  if (n >= PLAN_LIMIT) return { error: 'plan-limit' };
  const [dupe] = await db.select({ id: plans.id }).from(plans)
    .where(and(eq(plans.ownerEmail, owner), eq(plans.nameKey, name.key))).limit(1);
  if (dupe) return { error: 'duplicate-name' };
  const row = { id: randomUUID(), shareId: await uniqueShareId(db), ownerEmail: owner, name: name.name, nameKey: name.key, ...payload, createdAt: now, updatedAt: now };
  try {
    await db.insert(plans).values(row);
  } catch (e) {
    // The pre-check above loses a race to a second tab; the unique index does not.
    if (isUniqueViolation(e)) return { error: 'duplicate-name' };
    throw e;
  }
  const [saved] = await db.select().from(plans).where(eq(plans.id, row.id));
  return toSummary(saved);
}

export async function updatePlan(
  db: DB, email: string, id: string, patch: { name?: Name; payload?: PlanPayload }, now: number,
): Promise<PlanSummary | null | { error: 'duplicate-name' }> {
  const owner = lower(email);
  const mine = and(eq(plans.id, id), eq(plans.ownerEmail, owner));
  const [current] = await db.select({ id: plans.id }).from(plans).where(mine).limit(1);
  if (!current) return null;
  if (patch.name) {
    const [dupe] = await db.select({ id: plans.id }).from(plans)
      .where(and(eq(plans.ownerEmail, owner), eq(plans.nameKey, patch.name.key), ne(plans.id, id))).limit(1);
    if (dupe) return { error: 'duplicate-name' };
  }
  try {
    await db.update(plans).set({
      ...(patch.name ? { name: patch.name.name, nameKey: patch.name.key } : {}),
      ...(patch.payload ?? {}),
      updatedAt: now,
    }).where(mine);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: 'duplicate-name' };
    throw e;
  }
  const [saved] = await db.select().from(plans).where(mine);
  return toSummary(saved);
}

export async function deletePlan(db: DB, email: string, id: string): Promise<boolean> {
  const gone = await db.delete(plans).where(and(eq(plans.id, id), eq(plans.ownerEmail, lower(email)))).returning({ id: plans.id });
  return gone.length > 0;
}

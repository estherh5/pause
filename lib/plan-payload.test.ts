import { describe, it, expect } from 'vitest';
import { exceedsBodyCap, MAX_BODY_BYTES, normalizePlanPayload, validatePlanPayload } from './plan-payload.js';
import type { VercelRequest } from './vercel.js';

const ok = { activities: { 0: [] }, chartTypes: { 0: 'pie' }, timeUnit: 'day' };

describe('validatePlanPayload', () => {
  it('accepts a day plan', () => expect(validatePlanPayload(ok)).toBeNull());
  it.each([[null], [{}], [{ activities: {}, chartTypes: {} }], [{ activities: {}, timeUnit: 'day' }]])(
    'requires activities, chartTypes and timeUnit: %j',
    (data) => expect(validatePlanPayload(data)).toBe('Request must contain activities and time unit'),
  );
  it('requires dictionaries', () => {
    expect(validatePlanPayload({ ...ok, activities: [] })).toBe('Activities must be a dictionary');
    expect(validatePlanPayload({ ...ok, chartTypes: 'pie' })).toBe('Chart types must be a dictionary');
  });
  it('requires a known time unit', () => {
    expect(validatePlanPayload({ ...ok, timeUnit: 3 })).toBe('Time unit must be a string');
    expect(validatePlanPayload({ ...ok, timeUnit: 'year' })).toBe('Time unit must be day, week, or month');
  });
  it('requires month and integer year for a month plan', () => {
    expect(validatePlanPayload({ ...ok, timeUnit: 'month', month: 'October' })).toBe('Month data must contain a month and year');
    expect(validatePlanPayload({ ...ok, timeUnit: 'month', month: 'October', year: 2026.5 })).toBe('Month data must contain a month and year');
    expect(validatePlanPayload({ ...ok, timeUnit: 'month', month: 'October', year: 2026 })).toBeNull();
  });
});

describe('normalizePlanPayload', () => {
  it('drops month and year unless the plan is a month', () => {
    expect(normalizePlanPayload({ ...ok, timeUnit: 'week', month: 'May', year: 2020 } as never)).toMatchObject({ month: null, year: null });
  });
  it('strips transient errorMessage fields from activities', () => {
    const p = normalizePlanPayload({ ...ok, activities: { 0: [{ id: '?', value: 30, label: 'x', errorMessage: 'too many' }] } } as never);
    expect(p.activities[0][0]).toEqual({ id: '?', value: 30, label: 'x' });
  });
});

describe('exceedsBodyCap', () => {
  const req = (body: unknown, len?: string) => ({ body, headers: len ? { 'content-length': len } : {} }) as unknown as VercelRequest;
  it('trusts a content-length over the cap', () => expect(exceedsBodyCap(req({}, String(MAX_BODY_BYTES + 1)))).toBe(true));
  it('measures the parsed body when no header is present', () => {
    expect(exceedsBodyCap(req({ s: 'x'.repeat(MAX_BODY_BYTES) }))).toBe(true);
    expect(exceedsBodyCap(req(ok))).toBe(false);
  });
});

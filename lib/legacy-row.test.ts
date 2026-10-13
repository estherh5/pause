import { describe, it, expect } from 'vitest';
import { decodeJsonValue, diffShareIds, legacyCreatedMs, legacyRowToPlan } from './legacy-row.js';

const row = {
  id: 7, external_id: 'Ab3dEf6hIj9kLm2n',
  activities: JSON.stringify({ 0: [{ id: 1, value: 8, label: 'sleep' }] }), // the original API's string-in-JSON
  chart_types: { 0: 'pie' }, time_unit: 'day', month: null, year: null, created: '2018-06-30T14:05:09.123456',
};

describe('legacyRowToPlan', () => {
  it('keeps external_id as share_id, decodes JSON strings, marks the row legacy and ownerless', () => {
    const p = legacyRowToPlan(row, 99);
    expect(p).toMatchObject({
      shareId: 'Ab3dEf6hIj9kLm2n', ownerEmail: null, name: null, nameKey: null, source: 'legacy',
      activities: { 0: [{ id: 1, value: 8, label: 'sleep' }] }, chartTypes: { 0: 'pie' }, timeUnit: 'day',
    });
    expect(p.id).toBe('legacy-7');
    expect(p.createdAt).toBe(Date.UTC(2018, 5, 30, 14, 5, 9, 123));
    expect(p.updatedAt).toBe(p.createdAt);
  });
  it('keeps month and year for a month plan', () => {
    expect(legacyRowToPlan({ ...row, time_unit: 'month', month: 'May', year: 2019 }, 1)).toMatchObject({ month: 'May', year: 2019 });
  });
  it('a missing or unparseable created falls back to the copy time', () => {
    expect(legacyCreatedMs(null, 42)).toBe(42);
    expect(legacyCreatedMs('garbage', 42)).toBe(42);
  });
  it('decodeJsonValue leaves objects alone and unwraps double-encoded strings', () => {
    expect(decodeJsonValue({ a: 1 })).toEqual({ a: 1 });
    expect(decodeJsonValue('{"a":1}')).toEqual({ a: 1 });
    expect(decodeJsonValue(JSON.stringify(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
  });
});

describe('diffShareIds', () => {
  it('reports ids missing from Turso and extra ones', () => {
    expect(diffShareIds(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({ missing: ['a'], extra: ['d'] });
    expect(diffShareIds(['a'], ['a'])).toEqual({ missing: [], extra: [] });
  });
});

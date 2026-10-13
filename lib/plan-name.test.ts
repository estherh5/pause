import { describe, it, expect } from 'vitest';
import { MAX_NAME_LENGTH, nameKey, validatePlanName } from './plan-name.js';

describe('validatePlanName', () => {
  it('trims and keeps the typed casing', () => {
    expect(validatePlanName('  Week of Oct 12  ')).toEqual({ ok: true, name: 'Week of Oct 12', key: 'week of oct 12' });
  });
  it.each([[''], ['   '], [undefined], [null], [42]])('rejects %j with "Name the plan."', (raw) => {
    expect(validatePlanName(raw)).toEqual({ ok: false, error: 'Name the plan.' });
  });
  it('accepts exactly 80 characters and rejects 81', () => {
    expect(validatePlanName('a'.repeat(MAX_NAME_LENGTH)).ok).toBe(true);
    expect(validatePlanName('a'.repeat(MAX_NAME_LENGTH + 1))).toEqual({ ok: false, error: 'Keep the name to 80 characters.' });
  });
  it('counts characters, not UTF-16 units (80 emoji is fine)', () => {
    expect(validatePlanName('🌙'.repeat(80)).ok).toBe(true);
  });
  it.each([['a\nb'], ['a\tb'], ['a\u0000b'], ['a\u007fb']])('rejects control characters in %j', (raw) => {
    expect(validatePlanName(raw)).toEqual({ ok: false, error: "Names can't contain line breaks or tabs." });
  });
});

describe('nameKey', () => {
  it('ignores case and collapses inner whitespace', () => {
    expect(nameKey('My   Week')).toBe(nameKey('my week'));
  });
  it('normalizes Unicode so composed and decomposed é match', () => {
    expect(nameKey('Café')).toBe(nameKey('Café'));
  });
});

import { describe, expect, it } from 'vitest';
import { fabFor } from './fab.js';

const NEW_PLAN = { label: 'New plan', action: 'new-plan' };
describe('fabFor', () => {
  it.each([['/plans'], ['/plans/'], ['/somewhere-new']])('%s → New plan', (p) => expect(fabFor(p)).toEqual(NEW_PLAN));
  it.each([['/'], ['/stats'], ['/settings'], ['/admin/feedback'], ['/signin'], ['/privacy'], ['/invite/abc']])('%s → none', (p) => expect(fabFor(p)).toBeNull());
  it.each([['/statsy'], ['/adminx'], ['/invitee'], ['/privacy-old']])('lookalike %s of a null route is not null', (p) => expect(fabFor(p)).toEqual(NEW_PLAN));
});

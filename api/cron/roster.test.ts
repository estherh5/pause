import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callHandler } from '../../test/http.js';

const h = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../../db/index.js', () => ({ db: {} }));
vi.mock('../../lib/flare-roster.js', () => ({ pushRoster: h.push }));
const handler = (await import('./roster.js')).default;

beforeEach(() => { h.push.mockReset().mockResolvedValue(undefined); vi.stubEnv('CRON_SECRET', 'cron-secret'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('GET /api/cron/roster', () => {
  it('a bare GET is a 401 and pushes nothing', async () => {
    const out = await callHandler(handler, { method: 'GET' });
    expect(out).toMatchObject({ status: 401, body: 'Unauthorized' });
    expect(h.push).not.toHaveBeenCalled();
  });

  it('a wrong bearer is a 401', async () => {
    const out = await callHandler(handler, { method: 'GET', headers: { authorization: 'Bearer nope' } });
    expect(out.status).toBe(401);
    expect(h.push).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('an unset or blank CRON_SECRET (%j) fails closed, even against "Bearer <same>"', async (secret) => {
    vi.stubEnv('CRON_SECRET', secret);
    const out = await callHandler(handler, { method: 'GET', headers: { authorization: `Bearer ${secret}` } });
    expect(out.status).toBe(401);
    expect(h.push).not.toHaveBeenCalled();
  });

  it('the right bearer pushes the roster and answers { ok: true }', async () => {
    const out = await callHandler(handler, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } });
    expect(out).toMatchObject({ status: 200, body: { ok: true } });
    expect(h.push).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ reported: [] as { err: unknown; path: string }[] }));
vi.mock('@auth/core', () => ({
  Auth: () => Promise.reject(new Error('auth exploded')),
}));
vi.mock('../lib/flare-server.js', () => ({
  reportServerError: async (err: unknown, path: string) => { h.reported.push({ err, path }); },
}));
const { GET, POST } = await import('../api/auth/[...auth]');

beforeEach(() => { h.reported.length = 0; });

describe('api/auth is wrapped by flare (spec D14)', () => {
  it.each([['GET', GET], ['POST', POST]] as const)('%s reports a thrown error, then rethrows it', async (_m, fn) => {
    await expect(fn(new Request('https://pause.test/api/auth/session?x=1'))).rejects.toThrow('auth exploded');
    expect(h.reported).toHaveLength(1);
    expect((h.reported[0].err as Error).message).toBe('auth exploded');
    expect(h.reported[0].path).toBe('/api/auth/session');
  });
});

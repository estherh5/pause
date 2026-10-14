import { describe, it, expect, vi, afterEach } from 'vitest';
import { withFlare, reportServerError, sanitizeForFlare } from './flare-server.js';
import { callHandler } from '../test/http.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('withFlare', () => {
  it('turns a throw into a 500 JSON body and reports it in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('FLARE_URL', 'https://flare.example/api/ingest');
    vi.stubEnv('FLARE_KEY', 'k');
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return new Response(null, { status: 202 }); });
    const out = await callHandler(withFlare(async () => { throw new Error('boom'); }), { method: 'GET', url: '/api/plans?id=secret' });
    expect(out.status).toBe(500);
    expect(out.body).toEqual({ error: 'server-error' });
    expect(sent).toHaveLength(1);
    expect((sent[0] as { events: { kind: string; message: string; url: string }[] }).events[0]).toMatchObject({ kind: 'server', message: 'boom', url: '/api/plans' });
  });
  it('sends nothing outside production', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await callHandler(withFlare(async () => { throw new Error('x'); }), { method: 'GET' });
    expect(spy).not.toHaveBeenCalled();
  });
  it('never throws when the reporter itself fails', async () => {
    vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('FLARE_URL', 'u'); vi.stubEnv('FLARE_KEY', 'k');
    vi.stubGlobal('fetch', async () => { throw new Error('network'); });
    const out = await callHandler(withFlare(async () => { throw new Error('x'); }), { method: 'GET' });
    expect(out.status).toBe(500);
  });
  it('never ships query params: message and stack are cut at "\nparams:"', async () => {
    vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('FLARE_URL', 'u'); vi.stubEnv('FLARE_KEY', 'k');
    const sent: string[] = [];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => { sent.push(String(init.body)); return new Response(null, { status: 202 }); });
    const err = new Error('Failed query: select 1\nparams: a@b.com');
    err.stack = 'Error: Failed query: select 1\nparams: a@b.com\n    at x (file.ts:1:1)';
    await reportServerError(err, '/api/plans');
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('@');
    expect(sent[0]).toContain('Failed query: select 1');
    expect(sent[0]).toContain('at x (file.ts:1:1)');
    expect(sanitizeForFlare('q\nparams: 1\nmore')).toBe('q');
    expect(sanitizeForFlare('plain')).toBe('plain');
  });
});

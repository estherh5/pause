import { describe, it, expect, vi, afterEach } from 'vitest';
import { withFlare } from './flare-server.js';
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
});

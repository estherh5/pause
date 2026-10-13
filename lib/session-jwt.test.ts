import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encode } from '@auth/core/jwt';
import { sessionCookieConfig } from './session-cookie';
import { decodeSessionToken } from './session-jwt';
import { resetRingSessionMemo, RING_CHECK_INTERVAL_MS } from './ring-session-check';

const SALT = sessionCookieConfig(process.env).name; // NODE_ENV=test → dev name
const SECRET = 'ring-test-secret-at-least-32-characters!!';

describe('decodeSessionToken', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    // The ring check falls open here because no RING_SERVICE_SECRET is stubbed.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips a ring-minted token to email + name', async () => {
    const token = await encode({ salt: SALT, secret: SECRET, token: { email: 'esther@example.com', name: 'Esther' } });
    expect(await decodeSessionToken(token)).toEqual({ email: 'esther@example.com', name: 'Esther' });
  });

  it('defaults name to null when the token has no name', async () => {
    const token = await encode({ salt: SALT, secret: SECRET, token: { email: 'a@b.com' } });
    expect(await decodeSessionToken(token)).toEqual({ email: 'a@b.com', name: null });
  });

  it('returns null for a token minted with a different secret', async () => {
    const token = await encode({ salt: SALT, secret: 'a-completely-different-secret-32chars!', token: { email: 'a@b.com' } });
    expect(await decodeSessionToken(token)).toBeNull();
  });

  it('returns null for a missing token', async () => {
    expect(await decodeSessionToken(undefined)).toBeNull();
  });
});

describe('decodeSessionToken — ring session revocation', () => {
  // methods only ever READS the ring cookie here, so a revoked session is
  // refused on every read rather than cleared once. Fail open: anything but a
  // well-formed {valid:false} keeps the user.
  const stale = () => Date.now() - RING_CHECK_INTERVAL_MS - 60_000;
  const mint = (claims: Record<string, unknown>) =>
    encode({ salt: SALT, secret: SECRET, token: { email: 'esther@example.com', name: 'Esther', ...claims } });
  const answer = (body: unknown) =>
    vi.fn().mockResolvedValue({ status: 200, json: async () => body } as unknown as Response);

  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    vi.stubEnv('RING_SERVICE_SECRET', 's'.repeat(44));
    resetRingSessionMemo();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('a stale ringCheckedAt answered {valid:false} is null', async () => {
    const fetchMock = answer({ valid: false });
    vi.stubGlobal('fetch', fetchMock);
    const token = await mint({ signedInAt: 1, ringCheckedAt: stale() });
    expect(await decodeSessionToken(token)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a missing ringCheckedAt answered {valid:false} is null', async () => {
    const fetchMock = answer({ valid: false });
    vi.stubGlobal('fetch', fetchMock);
    const token = await mint({});
    expect(await decodeSessionToken(token)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the same stale cookie keeps the user when fetch rejects (fail open)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    const token = await mint({ signedInAt: 1, ringCheckedAt: stale() });
    expect(await decodeSessionToken(token)).toEqual({ email: 'esther@example.com', name: 'Esther' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith('ring session check: unknown — TypeError');
  });

  it('a stale cookie answered {valid:true} keeps the user', async () => {
    vi.stubGlobal('fetch', answer({ valid: true }));
    const token = await mint({ signedInAt: 1, ringCheckedAt: stale() });
    expect(await decodeSessionToken(token)).toEqual({ email: 'esther@example.com', name: 'Esther' });
  });

  it('a fresh ringCheckedAt makes no fetch call', async () => {
    const fetchMock = answer({ valid: false });
    vi.stubGlobal('fetch', fetchMock);
    const token = await mint({ signedInAt: 1, ringCheckedAt: Date.now() - 60_000 });
    expect(await decodeSessionToken(token)).toEqual({ email: 'esther@example.com', name: 'Esther' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

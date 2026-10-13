import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * THE AUTH CALLBACKS, TESTED THROUGH THE HANDLER THAT SHIPS THEM.
 *
 * methods' admission gate is `signIn`, and it is a single `return` inside
 * an object literal that used to be buried in `authConfig` inside
 * `api/auth/[...auth].ts`, where nothing could reach it. Three mutations
 * restore pre-feature behaviour; all three were run against PRODUCTION SOURCE
 * ONLY and all three are confirmed red here:
 *
 *   B.  `signIn`'s body -> `return true;` — the verified-email gate deleted.
 *       Reds "refuses a Google account whose email Google has not verified".
 *   C1. `authConfig = { …, callbacks: { ...callbacks, signIn: () => true } }`
 *       — a tested function swapped for an untested one INSIDE authConfig.
 *       Reds "authConfig.callbacks is the SAME object this test imports".
 *   C2. `Auth(request, { ...authConfig, callbacks: { ...callbacks, signIn:
 *       () => true } })` — the same swap, performed AT THE CALL SITE. Reds
 *       "hands Auth() that exact object — no spread at the call site".
 *
 * TWO PINS, BECAUSE ONE IS NOT ENOUGH. `expect(authConfig.callbacks).toBe(
 * callbacks)` is BLIND to C2: a spread inside GET/POST never touches
 * `authConfig`, so no assertion *about* `authConfig` can observe it while the
 * shipped function runs a different `signIn`. The only thing that can see it
 * is an assertion about what `Auth()` was actually handed — hence the
 * recording mock below. This was measured in restock, not reasoned about.
 *
 * Mutation A from the fleet brief (the jwt callback computing an admission
 * verdict and then discarding it) HAS NO ANALOGUE HERE: methods has no
 * admission/invite gate in this file. Its only `jwt` callback stamps the ring
 * sign-in claims (lib/ring-session-check.ts), pinned at the bottom.
 */

// `@auth/core` is mocked so that (a) importing the handler is survivable
// without real Google credentials or a live request, and (b) the argument
// `Auth()` receives is RECORDED. The recording is the entire C2 pin.
//
// `authCalls` is referenced only from inside the returned `Auth` function, not
// from the factory body, so the TDZ that `vi.mock` hoisting creates is never
// entered: the factory runs at import time, the closure body only when a test
// calls GET/POST.
const authCalls: { request: Request; config: unknown }[] = [];
vi.mock('@auth/core', () => ({
  Auth: (request: Request, config: unknown) => {
    authCalls.push({ request, config });
    return Promise.resolve(new Response(null, { status: 200 }));
  },
}));

// TOP-LEVEL, not `await import()` inside each test: `vi.mock` is hoisted above
// this line, so the mock is already registered, and a mid-test dynamic import
// is a known way to kill a whole file in these repos. The bracketed path is a
// real filename here, not a glob.
const { authConfig, callbacks, GET, POST } = await import('../api/auth/[...auth]');

/** Call the gate exactly as @auth/core would. No `?.` — `callbacks` is built
 *  with `satisfies`, so `signIn` is concretely present and a widened
 *  `… | undefined` would be a compile error rather than a silently skipped
 *  assertion. */
const signIn = (provider: string, profile: Record<string, unknown> | undefined) =>
  callbacks.signIn({
    user: {} as never,
    account: { provider } as never,
    profile: profile as never,
  });

beforeEach(() => {
  authCalls.length = 0;
});

describe('the handler runs on the object this test imports', () => {
  it('authConfig.callbacks is the SAME object this test imports', () => {
    // Identity, not deep equality. `callbacks: { ...callbacks, signIn:
    // somethingElse }` inside authConfig keeps every deep-equal assertion
    // green while replacing a tested function with an untested one; only
    // `toBe` sees it. (Mutation C1.)
    expect(authConfig.callbacks).toBe(callbacks);
  });

  it('hands Auth() that exact object — no spread at the call site', async () => {
    // Mutation C2, which the pin above CANNOT see. A spread inside GET/POST
    // leaves `authConfig` pristine, so what the app actually runs on is the
    // argument — and the argument is therefore what gets pinned.
    const request = new Request('https://methods.test/api/auth/session');
    await GET(request);
    await POST(new Request('https://methods.test/api/auth/signin', { method: 'POST' }));

    expect(authCalls).toHaveLength(2);
    for (const call of authCalls) {
      expect(call.config).toBe(authConfig);
      expect((call.config as typeof authConfig).callbacks).toBe(callbacks);
    }
  });
});

describe('callbacks.signIn', () => {
  it('refuses a Google account whose email Google has not verified', async () => {
    // Mutation B. methods maps access by email address, so an unverified
    // Google email is an unauthenticated claim to somebody else's account.
    expect(await signIn('google', { email: 'imposter@example.com', email_verified: false })).toBe(
      false,
    );
  });

  it('refuses a Google account that makes no email_verified claim at all', async () => {
    expect(await signIn('google', { email: 'silent@example.com' })).toBe(false);
    expect(await signIn('google', undefined)).toBe(false);
  });

  it('admits a Google account whose email Google has verified', async () => {
    // The other half of the pair: a gate that refuses everyone would pass the
    // two refusals above and still be broken.
    expect(await signIn('google', { email: 'real@example.com', email_verified: true })).toBe(true);
  });

  it('admits a non-Google provider without asking for email_verified', async () => {
    // Pinned so that adding a second provider cannot silently start being
    // judged by Google's claim (or silently start being refused).
    expect(await signIn('credentials', { email: 'elsewhere@example.com' })).toBe(true);
  });
});

describe('callbacks.jwt — the ring sign-in stamp', () => {
  // Without these claims every ported ring app reads `signedInAt` as 0, so
  // once the account resets its password a methods sign-in is revoked by the
  // next ring app it visits — every time. See lib/ring-session-check.ts.
  it('stamps numeric signedInAt and ringCheckedAt on sign-in', async () => {
    const before = Date.now();
    const token = await callbacks.jwt({
      token: { email: 'real@example.com' },
      user: { email: 'real@example.com' },
    } as never);
    const after = Date.now();

    expect(token).not.toBeNull();
    const t = token as Record<string, unknown>;
    expect(typeof t.signedInAt).toBe('number');
    expect(typeof t.ringCheckedAt).toBe('number');
    expect(t.signedInAt as number).toBeGreaterThanOrEqual(before);
    expect(t.signedInAt as number).toBeLessThanOrEqual(after);
    expect(t.ringCheckedAt).toBe(t.signedInAt);
  });

  it('never re-stamps signedInAt on a later read (no user)', async () => {
    // Overwriting signedInAt anywhere but sign-in would launder a revoked
    // session into a current one.
    const token = await callbacks.jwt({
      token: { email: 'real@example.com', signedInAt: 5 },
    } as never);
    expect((token as Record<string, unknown>).signedInAt).toBe(5);
  });
});

import { beforeEach } from "vitest";

/**
 * The real network is out of bounds under test, by default.
 *
 * methods' senders (lib/feedback-email.ts, lib/invite-email.ts) talk to Resend
 * through global `fetch`, and "no RESEND_API_KEY means no send" is only true
 * when the key is ABSENT — which a test cannot assume about the process it
 * runs in. flare's autofix launchd job (com.esther.flare-autofix) carries a
 * live RESEND_API_KEY in its own environment for its alert mail, and the
 * `npm test` gate it runs inside each app repo inherits it. On 2026-09-05 that
 * turned another fleet app's feedback tests into real Resend sends to the
 * maintainer and to fixture addresses.
 *
 * An absent secret is a coincidence, not a guard. This is the guard: a test
 * reaches the wire only by saying so. Suites that genuinely exercise a sender
 * stub `fetch` inside their own cases, which runs after the hook below and
 * overrides it.
 *
 * IT IS ASSIGNED AT MODULE LOAD, NOT ONLY IN THE HOOK. A guard installed solely
 * with `vi.stubGlobal` records the REAL `fetch` as the value to restore, so the
 * first `vi.unstubAllGlobals()` in any test (an `afterEach` cleanup is the
 * ordinary way to write one) would hand the wire back to every later test in
 * the same file, with nothing to see. Assigning here makes the guard the
 * baseline a restore lands on. `test/vitest-network-guard.test.ts` pins both
 * halves — the refusal, and the return after an unstub.
 */
const blockNetwork = (async (input: unknown) => {
  const target =
    typeof input === "string" ? input : (input as { url?: string })?.url ?? String(input);
  throw new Error(
    `Blocked a real network call from a test: ${target}\n` +
      "Nothing under test may reach the wire. Stub it in the test that needs it:\n" +
      '  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))',
  );
}) as unknown as typeof fetch;

globalThis.fetch = blockNetwork;

// And again between tests, so a suite that stubs `fetch` without unstubbing it
// cannot leave the next test in the same file holding its stub. Assignment
// rather than `vi.stubGlobal`, so vitest's own "original" — the value an
// unstub restores — stays the guard above in every ordering.
beforeEach(() => {
  globalThis.fetch = blockNetwork;
});

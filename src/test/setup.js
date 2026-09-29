import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

afterEach(cleanup);

/**
 * The real network is out of bounds under test, by default.
 *
 * The app talks to the pause API (loading and saving a shared schedule in
 * src/App.jsx) and reports errors to flare (src/lib/flare.js). No current
 * test takes either path, but "no current test happens to" is a coincidence,
 * not a guard: a new test that does would quietly hit whatever answers at the
 * configured URL, and flare's nightly autofix job runs `npm test` in each app
 * repo with live secrets in its environment. This is the guard: a test
 * reaches the wire only by saying so. A test's own
 * `vi.stubGlobal('fetch', ...)` runs after the hook below and overrides it.
 *
 * IT IS ASSIGNED AT MODULE LOAD, NOT ONLY IN THE HOOK. A guard installed
 * solely with `vi.stubGlobal` records the REAL `fetch` as the value to
 * restore, so the first `vi.unstubAllGlobals()` in any test would hand the
 * wire back to every later test in the same file, with nothing to see.
 * Assigning here makes the guard the baseline a restore lands on.
 * `src/vitest-network-guard.test.js` pins both halves — the refusal, and the
 * return after an unstub.
 */
const blockNetwork = async (input) => {
  const target = typeof input === 'string' ? input : input?.url ?? String(input);
  throw new Error(
    `Blocked a real network call from a test: ${target}\n` +
      'Nothing under test may reach the wire. Stub it in the test that needs it:\n' +
      '  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))',
  );
};

globalThis.fetch = blockNetwork;

// And again between tests, so a suite that stubs `fetch` without unstubbing it
// cannot leave the next test in the same file holding its stub. Assignment
// rather than `vi.stubGlobal`, so vitest's own "original" — the value an
// unstub restores — stays the guard above in every ordering.
beforeEach(() => {
  globalThis.fetch = blockNetwork;
});

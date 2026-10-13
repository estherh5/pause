/**
 * THE RING SESSION CHECK — methods' half of `POST
 * https://auth.crystalprism.io/api/session-check`.
 *
 * A password change on the auth service ends every ring session signed in
 * before it. The cookie is a stateless JWE, so the service cannot reach out and
 * kill one: each ring app asks, at most once per session per 15 minutes, and
 * returns null from its `jwt` callback on `{valid:false}` — which clears the
 * SHARED cookie, so one app's answer signs the person out of the whole ring.
 *
 * Both claims are RING-GLOBAL on purpose, unlike `checkedAt:<app>` in
 * lib/admin.ts: whether a password changed is a fact about the account, not
 * about one app's admission policy, so a sibling's fresh check is as good as
 * ours. `signedInAt` is written ONLY at sign-in; overwriting it anywhere else
 * would launder a revoked session into a current one.
 *
 * FAIL OPEN, decided 2026-09-21: anything but a well-formed 200 keeps the
 * session and is stamped as checked, so an auth-service outage never signs
 * the ring out and never costs more than one call per session per interval —
 * PER SESSION THAT PERSISTS ITS STAMP. An app that reads its session through
 * plain `await auth()` with no middleware has next-auth 5 discard the updated
 * JWT cookie the `jwt` callback returns, so `RING_CHECK_CLAIM`'s stamp above
 * never makes it back into the cookie and every read past the first 15
 * minutes would otherwise re-ask — at least twice per page, TIMEOUT_MS each,
 * for the whole length of an outage. The in-memory memo below is what still
 * bounds that to one call per session per interval when the cookie stamp
 * cannot be trusted to have landed.
 *
 * Copied verbatim into all eight ring apps; the contract lives in
 * `~/Developer/DESIGN.md` ("Ring sign-in").
 */

export const RING_SESSION_CHECK_URL = "https://auth.crystalprism.io/api/session-check";
export const SIGNED_IN_CLAIM = "signedInAt";
export const RING_CHECK_CLAIM = "ringCheckedAt";
export const RING_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 2000;
const MIN_SECRET_LENGTH = 32;
/** Above this many entries, a write prunes everything past its own interval
 *  rather than letting the memo grow for the life of the process. */
const MEMO_PRUNE_THRESHOLD = 1000;

export type RingSessionVerdict = "current" | "revoked" | "unknown";

type Deps = { fetchImpl?: typeof fetch; secret?: string };
type Claims = Record<string, unknown>;

/**
 * Ask the ring service directly. Never throws — every failure mode below
 * collapses to "unknown", the fail-open answer — but every one of them WARNS
 * first, naming only the reason, never the secret or the email: a
 * misconfigured or too-short secret silently disables revocation forever
 * otherwise, exactly the class of bug `test/ring-password.test.ts` already
 * guards on the sibling endpoint (LENGTH, not presence — see its own note on
 * why `vercel env pull` returning a Sensitive var as "" makes `if (!secret)`
 * the wrong guard).
 */
export async function checkRingSession(email: string, signedInAt: number, deps: Deps = {}): Promise<RingSessionVerdict> {
  const secret = deps.secret ?? process.env.RING_SERVICE_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    console.warn("ring session check: unknown — secret missing or too short");
    return "unknown";
  }

  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(RING_SESSION_CHECK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Ring-Secret": secret },
      body: JSON.stringify({ email, signedInAt }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    console.warn(`ring session check: unknown — ${err instanceof Error ? err.name : "fetch failed"}`);
    return "unknown";
  }

  if (res.status !== 200) {
    console.warn(`ring session check: unknown — status ${res.status}`);
    return "unknown";
  }

  let body: { valid?: unknown };
  try {
    body = (await res.json()) as { valid?: unknown };
  } catch {
    console.warn("ring session check: unknown — unparseable body");
    return "unknown";
  }

  if (body.valid === true) return "current";
  if (body.valid === false) return "revoked";
  console.warn("ring session check: unknown — body had no valid boolean");
  return "unknown";
}

/** Call on the sign-in branch of `jwt` ONLY (where `user` is set). */
export function stampSignIn(token: Claims, now: number): void {
  token[SIGNED_IN_CLAIM] = now;
  token[RING_CHECK_CLAIM] = now;
}

// ---------------------------------------------------------------------------
// THE MEMO — see the file header for why this exists at all.
//
// Keyed on `${email}|${signedInAt}`, the SESSION, not the account: a
// sign-out/sign-in cycle mints a new `signedInAt`, so the new session is
// never answered out of an entry the OLD one earned. A `verdict` of
// "unknown" is memoized as "current" — the same fail-open rule as the token
// stamp, and the reason the memo helps an outage rather than just a healthy
// interval: without it, a down auth service would eat one `TIMEOUT_MS`
// fetch on every `auth()` call for as long as it stayed down.
// ---------------------------------------------------------------------------
type MemoEntry = { verdict: "current" | "revoked"; at: number };
const memo = new Map<string, MemoEntry>();

function memoKey(email: string, signedInAt: number): string {
  return `${email}|${signedInAt}`;
}

function pruneMemo(now: number): void {
  if (memo.size <= MEMO_PRUNE_THRESHOLD) return;
  for (const [key, entry] of memo) {
    if (now - entry.at > RING_CHECK_INTERVAL_MS) memo.delete(key);
  }
}

/** Test-only escape hatch. The memo is module-level and outlives any one
 *  call by design (see the file header) — which makes it shared state
 *  between test cases that reuse an email/signedInAt pair, so a test file
 *  exercising more than one call for the same session clears it first. */
export function resetRingSessionMemo(): void {
  memo.clear();
}

/** Returns the token to keep the session, or null to destroy it. */
export async function revalidateRingSession<T extends Claims>(token: T, now: number, deps: Deps = {}): Promise<T | null> {
  const email = token.email;
  if (typeof email !== "string" || !email) return token;

  const checkedAt = token[RING_CHECK_CLAIM];
  if (Number.isFinite(checkedAt) && now - (checkedAt as number) <= RING_CHECK_INTERVAL_MS) return token;

  const rawSignedInAt = token[SIGNED_IN_CLAIM];
  const signedInAt = Number.isFinite(rawSignedInAt) ? (rawSignedInAt as number) : 0;

  const key = memoKey(email, signedInAt);
  const cached = memo.get(key);
  if (cached && now - cached.at <= RING_CHECK_INTERVAL_MS) {
    if (cached.verdict === "revoked") return null;
    // The time the verdict was earned, not this read's: stamping `now` would
    // let the cookie defer the next real check past the memo's own expiry.
    (token as Claims)[RING_CHECK_CLAIM] = cached.at;
    return token;
  }

  const verdict = await checkRingSession(email, signedInAt, deps);
  memo.set(key, { verdict: verdict === "revoked" ? "revoked" : "current", at: now });
  pruneMemo(now);

  if (verdict === "revoked") return null;
  (token as Claims)[RING_CHECK_CLAIM] = now;
  return token;
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkRingSession,
  stampSignIn,
  revalidateRingSession,
  resetRingSessionMemo,
  RING_SESSION_CHECK_URL,
  SIGNED_IN_CLAIM,
  RING_CHECK_CLAIM,
  RING_CHECK_INTERVAL_MS,
} from "./ring-session-check";

/**
 * THE RING SESSION CHECK — the reference implementation seven other ring apps
 * copy byte-for-byte. `@/vitest.setup.ts` throws on any unstubbed remote
 * fetch, so every test here injects `fetchImpl` through `deps` rather than
 * touching global fetch — see test/ring-password.test.ts for the same
 * discipline against the sibling endpoint.
 *
 * The module keeps an in-memory memo of recent verdicts, keyed on
 * `email|signedInAt`, so it outlives any one call — see the module's own
 * header for why. That makes it SHARED STATE across the test cases below,
 * several of which reuse the same email and `now`; `resetRingSessionMemo()`
 * clears it before every test.
 */

const SECRET = "s".repeat(44); // >= MIN_SECRET_LENGTH (32)

/** A `Response`-shaped stub. */
function response(status: number, body: unknown) {
  return { status, json: async () => body } as unknown as Response;
}

let warnings: unknown[][];

beforeEach(() => {
  resetRingSessionMemo();
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void warnings.push(args));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const warned = () => warnings.flat().map(String).join("\n");

describe("checkRingSession — the request", () => {
  it("POSTs the exact shape: URL, method, header, body, and an AbortSignal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: true }));

    await checkRingSession("a@b.com", 123, { fetchImpl, secret: SECRET });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RING_SESSION_CHECK_URL);
    expect(url).toBe("https://auth.crystalprism.io/api/session-check");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Ring-Secret"]).toBe(SECRET);
    expect(JSON.parse(String(init.body))).toEqual({ email: "a@b.com", signedInAt: 123 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("checkRingSession — the verdict", () => {
  it("200 {valid:true} is 'current'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: true }));
    expect(await checkRingSession("a@b.com", 1, { fetchImpl, secret: SECRET })).toBe("current");
  });

  it("200 {valid:false} is 'revoked'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: false }));
    expect(await checkRingSession("a@b.com", 1, { fetchImpl, secret: SECRET })).toBe("revoked");
  });

  it("200 {valid:\"no\"} — not a boolean — is 'unknown'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: "no" }));
    expect(await checkRingSession("a@b.com", 1, { fetchImpl, secret: SECRET })).toBe("unknown");
  });

  for (const status of [401, 500, 503]) {
    it(`${status} is 'unknown'`, async () => {
      const fetchImpl = vi.fn().mockResolvedValue(response(status, { ok: false }));
      expect(await checkRingSession("a@b.com", 1, { fetchImpl, secret: SECRET })).toBe("unknown");
    });
  }

  it("a rejected fetch is 'unknown'", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect(await checkRingSession("a@b.com", 1, { fetchImpl, secret: SECRET })).toBe("unknown");
  });

  it("a secret shorter than the minimum is 'unknown' and makes no request", async () => {
    const fetchImpl = vi.fn();
    expect(await checkRingSession("a@b.com", 1, { fetchImpl, secret: "short" })).toBe("unknown");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("checkRingSession — every 'unknown' path warns, naming only the reason", () => {
  // THE SILENT-DISABLE CONCERN: a mis-set secret returns "unknown" forever,
  // which is indistinguishable from "the account's password never changed"
  // unless something is logged. Every branch below must warn, and never with
  // the secret or the email in the message.
  const EMAIL = "esther@example.com";

  it("warns on a secret that is missing or too short", async () => {
    const fetchImpl = vi.fn();
    await checkRingSession(EMAIL, 1, { fetchImpl, secret: "short" });
    expect(warned()).toContain("secret missing or too short");
    expect(warned()).not.toContain(SECRET);
    expect(warned()).not.toContain(EMAIL);
  });

  it("warns on a non-200 status, naming the status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(503, { ok: false }));
    await checkRingSession(EMAIL, 1, { fetchImpl, secret: SECRET });
    expect(warned()).toContain("status 503");
    expect(warned()).not.toContain(SECRET);
    expect(warned()).not.toContain(EMAIL);
  });

  it("warns on a 200 whose body is not JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    } as unknown as Response);
    await checkRingSession(EMAIL, 1, { fetchImpl, secret: SECRET });
    expect(warned()).toContain("unparseable body");
    expect(warned()).not.toContain(SECRET);
    expect(warned()).not.toContain(EMAIL);
  });

  it("warns on a 200 whose body has no valid boolean", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: "no" }));
    await checkRingSession(EMAIL, 1, { fetchImpl, secret: SECRET });
    expect(warned()).toContain("body had no valid boolean");
    expect(warned()).not.toContain(SECRET);
    expect(warned()).not.toContain(EMAIL);
  });

  it("warns on a rejected fetch, naming the error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await checkRingSession(EMAIL, 1, { fetchImpl, secret: SECRET });
    expect(warned()).toContain("TypeError");
    expect(warned()).not.toContain(SECRET);
    expect(warned()).not.toContain(EMAIL);
  });
});

describe("stampSignIn", () => {
  it("sets signedInAt and ringCheckedAt to now", () => {
    const token: Record<string, unknown> = {};
    stampSignIn(token, 1000);
    expect(token[SIGNED_IN_CLAIM]).toBe(1000);
    expect(token[RING_CHECK_CLAIM]).toBe(1000);
  });
});

describe("revalidateRingSession", () => {
  it("a fresh ringCheckedAt (now - 1 min) keeps the token and makes no request", async () => {
    const fetchImpl = vi.fn();
    const now = 1_000_000;
    const token = { email: "a@b.com", [RING_CHECK_CLAIM]: now - 60_000 };
    const result = await revalidateRingSession(token, now, { fetchImpl, secret: SECRET });
    expect(result).toBe(token);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stale ringCheckedAt (now - 16 min) + revoked verdict destroys the token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: false }));
    const now = 1_000_000;
    const token = { email: "a@b.com", [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };
    const result = await revalidateRingSession(token, now, { fetchImpl, secret: SECRET });
    expect(result).toBeNull();
  });

  it("a missing stamp + current verdict returns the token with ringCheckedAt === now", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: true }));
    const now = 1_000_000;
    const token: Record<string, unknown> = { email: "a@b.com" };
    const result = await revalidateRingSession(token, now, { fetchImpl, secret: SECRET });
    expect(result).toBe(token);
    expect(result![RING_CHECK_CLAIM]).toBe(now);
  });

  it("an unknown verdict keeps the token AND stamps ringCheckedAt === now", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(503, { ok: false }));
    const now = 1_000_000;
    const token = { email: "a@b.com", [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };
    const result = await revalidateRingSession(token, now, { fetchImpl, secret: SECRET });
    expect(result).toBe(token);
    expect(result![RING_CHECK_CLAIM]).toBe(now);
  });

  it("a token without signedInAt sends signedInAt: 0", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: true }));
    const now = 1_000_000;
    const token: Record<string, unknown> = { email: "a@b.com" };
    await revalidateRingSession(token, now, { fetchImpl, secret: SECRET });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ signedInAt: 0 });
  });

  it("a token with no email is returned untouched and makes no request", async () => {
    const fetchImpl = vi.fn();
    const now = 1_000_000;
    const token: Record<string, unknown> = { [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };
    const result = await revalidateRingSession(token, now, { fetchImpl, secret: SECRET });
    expect(result).toBe(token);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a NaN signedInAt is sent as 0, not as NaN", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: true }));
    const now = 1_000_000;
    const token: Record<string, unknown> = { email: "a@b.com", [SIGNED_IN_CLAIM]: NaN };
    await revalidateRingSession(token, now, { fetchImpl, secret: SECRET });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ email: "a@b.com", signedInAt: 0 });
  });

  it("an Infinity ringCheckedAt does not freeze the check forever — it still fetches", async () => {
    // THE DISCRIMINATING CASE for the isFinite guard: `typeof Infinity ===
    // "number"` is true, so a naive `typeof checkedAt === "number"` reads an
    // Infinity stamp as eternally fresh (`now - Infinity` is always <=
    // the interval) and the session is never checked again.
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: true }));
    const now = 1_000_000;
    const token = { email: "a@b.com", [RING_CHECK_CLAIM]: Infinity };
    await revalidateRingSession(token, now, { fetchImpl, secret: SECRET });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("revalidateRingSession — the in-memory memo", () => {
  // THE PERSISTENCE PROBLEM: tide reads its session through plain `await
  // auth()`, with no middleware, so next-auth 5 discards the updated cookie
  // the `jwt` callback returns and `RING_CHECK_CLAIM`'s stamp on the token
  // never survives to the next call. These simulate that — two SEPARATE
  // token objects (fresh decodes, as `auth()` would hand back), never the
  // same object twice — so only the memo, not the token's own stamp, can be
  // what avoids the second fetch.
  it("two separate token objects for the same stale session make exactly one fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: true }));
    const now = 1_000_000;
    const tokenA = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };
    const tokenB = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };

    const resultA = await revalidateRingSession(tokenA, now, { fetchImpl, secret: SECRET });
    const resultB = await revalidateRingSession(tokenB, now + 1000, { fetchImpl, secret: SECRET });

    expect(resultA).toBe(tokenA);
    expect(resultB).toBe(tokenB);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The second call is answered from the memo, and the token it was HANDED
    // is re-stamped with the time that verdict was EARNED (`now`), never the
    // time of this read. Stamping the read time would let a persisted cookie
    // defer the next real check by up to a whole extra interval, so a session
    // revoked just after the memoized check could outlive its 15 minutes.
    expect(resultB![RING_CHECK_CLAIM]).toBe(now);
  });

  it("a revoked memo entry destroys a second token without fetching again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: false }));
    const now = 1_000_000;
    const tokenA = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };
    const tokenB = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };

    expect(await revalidateRingSession(tokenA, now, { fetchImpl, secret: SECRET })).toBeNull();
    expect(await revalidateRingSession(tokenB, now + 1000, { fetchImpl, secret: SECRET })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a memo entry older than the interval fetches again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: true }));
    const now = 1_000_000;
    const tokenA = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };
    const later = now + RING_CHECK_INTERVAL_MS + 1;
    const tokenB = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: later - 16 * 60 * 1000 };

    await revalidateRingSession(tokenA, now, { fetchImpl, secret: SECRET });
    await revalidateRingSession(tokenB, later, { fetchImpl, secret: SECRET });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("an unknown verdict is memoized as current, so a second stale read does not re-fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(503, { ok: false }));
    const now = 1_000_000;
    const tokenA = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };
    const tokenB = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };

    expect(await revalidateRingSession(tokenA, now, { fetchImpl, secret: SECRET })).toBe(tokenA);
    expect(await revalidateRingSession(tokenB, now + 1000, { fetchImpl, secret: SECRET })).toBe(tokenB);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a different signedInAt (a new sign-in) is a different memo entry, not a hit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { valid: false }));
    const now = 1_000_000;
    const tokenA = { email: "a@b.com", [SIGNED_IN_CLAIM]: 500, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };
    const tokenB = { email: "a@b.com", [SIGNED_IN_CLAIM]: 999, [RING_CHECK_CLAIM]: now - 16 * 60 * 1000 };

    await revalidateRingSession(tokenA, now, { fetchImpl, secret: SECRET });
    await revalidateRingSession(tokenB, now, { fetchImpl, secret: SECRET });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("constants", () => {
  it("are pinned to their literal values", () => {
    expect(RING_CHECK_INTERVAL_MS).toBe(900_000);
    expect(SIGNED_IN_CLAIM).toBe("signedInAt");
    expect(RING_CHECK_CLAIM).toBe("ringCheckedAt");
    expect(RING_SESSION_CHECK_URL).toBe("https://auth.crystalprism.io/api/session-check");
  });
});

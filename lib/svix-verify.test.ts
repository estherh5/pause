import { describe, it, expect } from "vitest";
import { verifySvixSignature } from "./svix-verify";

// Svix's documented test vector (https://docs.svix.com/receiving/verifying-payloads/how-manual).
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"; // gitleaks:allow — Svix documentation example secret, not a credential
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TS = "1614265330";
const BODY = '{"test": 2432232314}';
const SIG = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
// nowMs within tolerance of the vector's timestamp.
const NOW = 1614265330 * 1000;

describe("verifySvixSignature", () => {
  it("accepts a valid Svix signature (documented vector)", () => {
    expect(verifySvixSignature(SECRET, { id: ID, timestamp: TS, signature: SIG }, BODY, NOW)).toEqual({ ok: true });
  });

  it("accepts when the header carries multiple space-separated signatures", () => {
    const multi = `v1,badbadbadbadbadbadbadbadbadbadbadbadbadbadbad= ${SIG}`;
    expect(verifySvixSignature(SECRET, { id: ID, timestamp: TS, signature: multi }, BODY, NOW)).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const r = verifySvixSignature(SECRET, { id: ID, timestamp: TS, signature: SIG }, '{"test": 9999}', NOW);
    expect(r).toEqual({ ok: false, reason: "no matching signature" });
  });

  it("rejects a wrong secret", () => {
    const r = verifySvixSignature("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaXX", { id: ID, timestamp: TS, signature: SIG }, BODY, NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(verifySvixSignature(SECRET, { id: null, timestamp: TS, signature: SIG }, BODY, NOW).ok).toBe(false);
    expect(verifySvixSignature(SECRET, { id: ID, timestamp: null, signature: SIG }, BODY, NOW).ok).toBe(false);
    expect(verifySvixSignature(SECRET, { id: ID, timestamp: TS, signature: null }, BODY, NOW).ok).toBe(false);
  });

  it("rejects a timestamp outside the tolerance window (replay guard)", () => {
    const r = verifySvixSignature(SECRET, { id: ID, timestamp: TS, signature: SIG }, BODY, NOW + 10 * 60 * 1000);
    expect(r).toEqual({ ok: false, reason: "timestamp out of tolerance" });
  });
});

// Verifies a Svix-signed webhook (Resend uses Svix). Pure, dependency-free —
// implements the documented scheme so we don't pull in the `svix` package.
// https://docs.svix.com/receiving/verifying-payloads/how-manual
import { createHmac, timingSafeEqual } from "node:crypto";

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

const DEFAULT_TOLERANCE_SEC = 300; // 5 min replay window, matching Svix

export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  rawBody: string,
  nowMs: number,
  toleranceSec: number = DEFAULT_TOLERANCE_SEC,
): { ok: true } | { ok: false; reason: string } {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing svix headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(nowMs / 1000 - ts) > toleranceSec) return { ok: false, reason: "timestamp out of tolerance" };

  // Secret is `whsec_<base64>`; the bytes after the prefix are the HMAC key.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = Buffer.from(createHmac("sha256", secretBytes).update(signedContent).digest("base64"));

  // The header is a space-separated list of `<version>,<base64sig>` entries.
  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    const sig = Buffer.from(comma === -1 ? part : part.slice(comma + 1));
    if (sig.length === expected.length && timingSafeEqual(sig, expected)) return { ok: true };
  }
  return { ok: false, reason: "no matching signature" };
}

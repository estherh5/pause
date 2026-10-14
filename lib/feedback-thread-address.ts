// Encodes a per-feedback reply address and verifies replies to it. Pure —
// no DB or Resend — so it can be unit-tested in isolation. The HMAC is the
// security gate: an inbound reply is only trusted if its address carries a
// signature we could have produced for that exact feedback id.
import { createHmac, timingSafeEqual } from "node:crypto";

// Identifies which crystalprism app a reply belongs to. All apps share the
// crystalprism.io inbox; this prefix disambiguates. pause = "a" (the taken
// list is in ~/Developer/DESIGN.md, "Inbound replies close the loop").
export const APP_PREFIX = "a";
const SIG_LEN = 16; // hex chars of the truncated HMAC-SHA256

export function signFeedbackId(feedbackId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${APP_PREFIX}.${feedbackId}`).digest("hex").slice(0, SIG_LEN);
}

/** Full reply address, e.g. `reply+a.<uuid>.<sig>@crystalprism.io`. */
export function encodeReplyAddress(feedbackId: string, secret: string, domain: string): string {
  return `reply+${APP_PREFIX}.${feedbackId}.${signFeedbackId(feedbackId, secret)}@${domain}`;
}

export type DecodedReply = { ok: true; feedbackId: string } | { ok: false; reason: string };

export function decodeReplyAddress(address: string, secret: string): DecodedReply {
  const local = address.split("@")[0]?.trim().toLowerCase();
  if (!local) return { ok: false, reason: "no local part" };
  const body = local.startsWith("reply+") ? local.slice("reply+".length) : local;
  const parts = body.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [prefix, feedbackId, sig] = parts;
  if (prefix !== APP_PREFIX) return { ok: false, reason: "wrong app" };
  const expected = signFeedbackId(feedbackId, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad signature" };
  return { ok: true, feedbackId };
}

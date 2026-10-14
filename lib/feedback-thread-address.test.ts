import { describe, it, expect } from "vitest";
import { encodeReplyAddress, decodeReplyAddress, signFeedbackId, APP_PREFIX } from "./feedback-thread-address";

const SECRET = "test-secret-123";
const ID = "11111111-2222-3333-4444-555555555555";

describe("feedback-thread-address", () => {
  it("round-trips a feedback id through encode/decode", () => {
    const addr = encodeReplyAddress(ID, SECRET, "crystalprism.io");
    expect(addr).toBe(`reply+${APP_PREFIX}.${ID}.${signFeedbackId(ID, SECRET)}@crystalprism.io`);
    const decoded = decodeReplyAddress(addr, SECRET);
    expect(decoded).toEqual({ ok: true, feedbackId: ID });
  });

  it("rejects a tampered signature", () => {
    const addr = `reply+${APP_PREFIX}.${ID}.deadbeefdeadbeef@crystalprism.io`;
    expect(decodeReplyAddress(addr, SECRET)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects a signature made with a different secret", () => {
    const addr = encodeReplyAddress(ID, "other-secret", "crystalprism.io");
    expect(decodeReplyAddress(addr, SECRET).ok).toBe(false);
  });

  it("rejects a wrong app prefix", () => {
    const sig = signFeedbackId(ID, SECRET);
    expect(decodeReplyAddress(`reply+x.${ID}.${sig}@crystalprism.io`, SECRET)).toEqual({ ok: false, reason: "wrong app" });
  });

  it("rejects a malformed local part", () => {
    expect(decodeReplyAddress("hello@crystalprism.io", SECRET).ok).toBe(false);
  });

  it("decodes case-insensitively (some MTAs lowercase the local part)", () => {
    const addr = encodeReplyAddress(ID, SECRET, "crystalprism.io").toUpperCase();
    expect(decodeReplyAddress(addr, SECRET)).toEqual({ ok: true, feedbackId: ID });
  });
});

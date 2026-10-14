import { describe, it, expect } from "vitest";
import { stripQuotedReply, isAutoReply, REPLY_SEPARATOR } from "./email-reply-parser";

describe("stripQuotedReply", () => {
  it("keeps only text above our sentinel separator", () => {
    const raw = `Thanks, but the button is still broken.\n\n${REPLY_SEPARATOR}\n> Esther replied to your Pause feedback`;
    expect(stripQuotedReply(raw)).toBe("Thanks, but the button is still broken.");
  });

  it("falls back to the 'On ... wrote:' marker when no sentinel", () => {
    const raw = "Still broken.\n\nOn Mon, Jul 9, 2026 at 10:00 AM Pause <pause@crystalprism.io> wrote:\n> hi";
    expect(stripQuotedReply(raw)).toBe("Still broken.");
  });

  it("drops trailing quoted lines", () => {
    expect(stripQuotedReply("Real reply\n> quoted 1\n> quoted 2")).toBe("Real reply");
  });

  it("normalizes CRLF and trims", () => {
    expect(stripQuotedReply("  hi there  \r\n")).toBe("hi there");
  });

  it("returns empty string when there is no new content", () => {
    expect(stripQuotedReply(`${REPLY_SEPARATOR}\nold stuff`)).toBe("");
  });
});

describe("isAutoReply", () => {
  it("flags Auto-Submitted other than 'no'", () => {
    expect(isAutoReply({ "Auto-Submitted": "auto-replied" })).toBe(true);
    expect(isAutoReply({ "Auto-Submitted": "no" })).toBe(false);
  });
  it("flags bulk/auto precedence", () => {
    expect(isAutoReply({ Precedence: "bulk" })).toBe(true);
  });
  it("is false for a normal reply", () => {
    expect(isAutoReply({ From: "user@example.com" })).toBe(false);
  });
});

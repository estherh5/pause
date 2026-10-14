// Real mail-client reply shapes: signatures, mobile footers and wrapped or
// quoted attributions must never reach the stored feedback message.
import { describe, it, expect } from "vitest";
import { stripQuotedReply, REPLY_SEPARATOR } from "./email-reply-parser";

describe("stripQuotedReply — real mail clients", () => {
  // What Gmail actually sends as text/plain: a "-- " signature, then an
  // attribution line it wraps at ~78 columns, then the quoted message —
  // sentinel included, but behind "> ".
  it("drops a Gmail signature and a wrapped attribution above the quoted sentinel", () => {
    const raw =
      "Thanks, that works!\r\n\r\n-- \r\nEsther Hoffman\r\nestherhoffman.com\r\n\r\n" +
      "On Sat, Sep 27, 2026 at 3:14 PM Passage <passage@crystalprism.io>\r\nwrote:\r\n\r\n" +
      `> ${REPLY_SEPARATOR}\r\n>\r\n> Your feedback on Passage was updated.\r\n`;
    expect(stripQuotedReply(raw)).toBe("Thanks, that works!");
  });

  it("drops a single-line attribution left above the sentinel", () => {
    const raw = `Sounds good\n\nOn Sat, Sep 27, 2026, Passage wrote:\n\n> ${REPLY_SEPARATOR}\n> old`;
    expect(stripQuotedReply(raw)).toBe("Sounds good");
  });

  it("drops an iPhone footer and its quoted attribution", () => {
    const raw =
      "Got it\n\nSent from my iPhone\n\n" +
      `> On Sep 27, 2026, at 3:14 PM, Passage <passage@crystalprism.io> wrote:\n>\n> \uFEFF${REPLY_SEPARATOR}\n> old`;
    expect(stripQuotedReply(raw)).toBe("Got it");
  });

  it("cuts at the EARLIEST marker, not the first one in the list", () => {
    const raw = "New text\n\n-----Original Message-----\nFrom: Passage\nOn Mon someone wrote:\nold";
    expect(stripQuotedReply(raw)).toBe("New text");
  });

  it("keeps a line that merely starts with 'On'", () => {
    expect(stripQuotedReply("On second thought, keep it.\nThanks")).toBe("On second thought, keep it.\nThanks");
  });

  it("does not treat an 'On' paragraph as an attribution across a blank line", () => {
    const raw = "On the map, the pin is wrong.\n\nAnna wrote:\nthe cafe moved.";
    expect(stripQuotedReply(raw)).toBe(raw);
  });
});

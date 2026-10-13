import { describe, it, expect } from "vitest";
import { tokenizeLinks } from "./linkify.js";

const links = (t) => tokenizeLinks(t).filter((k) => k.type === "link");

describe("tokenizeLinks", () => {
  it("links an explicit https URL and preserves surrounding text", () => {
    const toks = tokenizeLinks("see https://a.co/d/0cuWHwvG for it");
    expect(toks).toEqual([
      { type: "text", value: "see " },
      { type: "link", value: "https://a.co/d/0cuWHwvG", href: "https://a.co/d/0cuWHwvG" },
      { type: "text", value: " for it" },
    ]);
  });

  it("links a bare domain and prefixes https", () => {
    const [l] = links("log into crystalprism.io please");
    expect(l).toEqual({ type: "link", value: "crystalprism.io", href: "https://crystalprism.io" });
  });

  it("links www. hosts", () => {
    const [l] = links("go to www.example.com now");
    expect(l.href).toBe("https://www.example.com");
  });

  it("keeps a trailing period out of the link", () => {
    const toks = tokenizeLinks("visit crystalprism.io.");
    expect(links("visit crystalprism.io.")[0].value).toBe("crystalprism.io");
    expect(toks[toks.length - 1]).toEqual({ type: "text", value: "." });
  });

  it("does not linkify an email address", () => {
    expect(links("mail saxenaankur001@gmail.com today")).toHaveLength(0);
  });

  it("keeps balanced parens but drops a trailing sentence paren", () => {
    expect(links("see https://en.wikipedia.org/wiki/Foo_(bar)")[0].value).toBe(
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    );
    expect(links("(see https://example.com/x)")[0].value).toBe("https://example.com/x");
  });

  it("returns a single text token when there is no URL", () => {
    expect(tokenizeLinks("no links here at all")).toEqual([
      { type: "text", value: "no links here at all" },
    ]);
  });

  it("handles multiple links in one message", () => {
    expect(links("giftme.io and passage.app both")).toHaveLength(2);
  });
});

import { describe, it, expect } from "vitest";
import { EMAIL_THEME, renderEmailShell } from "./email-shell";

describe("renderEmailShell body slot", () => {
  it("sets the body font on the body slot, so an unstyled <p> never falls back to serif", () => {
    const html = renderEmailShell({ kicker: "Kicker", body: "<p>Body</p>" });
    const slot = html.match(/<div class="[^"]*" style="([^"]*)"><p>Body<\/p><\/div>/);
    expect(slot?.[1]).toContain(`font-family:${EMAIL_THEME.body}`);
    expect(slot?.[1]).toContain(`color:${EMAIL_THEME.ink}`);
  });
});

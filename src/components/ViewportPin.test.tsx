// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ViewportPin, { viewportGap } from "./ViewportPin";

describe("viewportGap", () => {
  it("is 0 when the viewports agree", () => {
    expect(viewportGap({ height: 844, offsetTop: 0, scale: 1 }, 844, false)).toBe(0);
  });

  it("moves a bar that floats above the screen's bottom back down (offsetTop stuck after the keyboard)", () => {
    expect(viewportGap({ height: 844, offsetTop: 293, scale: 1 }, 844, false)).toBe(293);
  });

  it("moves a bar that hangs below a shrunken visual viewport back up", () => {
    expect(viewportGap({ height: 760, offsetTop: 0, scale: 1 }, 844, false)).toBe(-84);
  });

  it("leaves the bar alone while typing, under the keyboard", () => {
    expect(viewportGap({ height: 500, offsetTop: 0, scale: 1 }, 844, true)).toBe(0);
  });

  it("leaves the bar alone while pinch-zoomed", () => {
    expect(viewportGap({ height: 400, offsetTop: 120, scale: 2 }, 844, false)).toBe(0);
  });

  it("ignores subpixel rounding", () => {
    expect(viewportGap({ height: 843.4, offsetTop: 0, scale: 1 }, 844, false)).toBe(0);
  });
});

describe("ViewportPin", () => {
  const original = window.visualViewport;
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", { value: original, configurable: true });
    document.documentElement.style.removeProperty("--vv-gap");
  });

  it("publishes the gap as --vv-gap on <html> and clears it on unmount", async () => {
    const vv = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 293, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    const { unmount } = render(<ViewportPin />);
    await vi.waitFor(() => expect(document.documentElement.style.getPropertyValue("--vv-gap")).toBe("293px"));
    vv.offsetTop = 0;
    vv.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => expect(document.documentElement.style.getPropertyValue("--vv-gap")).toBe(""));
    vv.offsetTop = 50;
    vv.dispatchEvent(new Event("resize"));
    await vi.waitFor(() => expect(document.documentElement.style.getPropertyValue("--vv-gap")).toBe("50px"));
    unmount();
    expect(document.documentElement.style.getPropertyValue("--vv-gap")).toBe("");
  });
});

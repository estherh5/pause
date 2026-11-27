import { useEffect } from "react";

/**
 * Keeps the bottom-pinned bars on the screen's bottom edge in iOS WebKit
 * (Safari, and Firefox/Chrome on iPhone, which run on WebKit).
 *
 * WebKit lays `position: fixed` out against the layout viewport. Since iOS 26,
 * after the keyboard closes or the toolbar hides mid-scroll, the visual
 * viewport can stay out of step with it (`visualViewport.offsetTop` stuck
 * above 0), and every `bottom: 0` bar floats up the screen by that much until
 * a reload. WebKit bugs 297779 and 301857; Apple forums thread 800125.
 *
 * This measures the gap between where a `bottom: 0` element is drawn and the
 * real bottom of the screen, and publishes it as `--vv-gap` on <html>. The
 * pinned elements subtract it from their `bottom` (admin.css, Fab.css).
 *
 * Copied from aerie/components/ViewportPin.tsx; keep the two in step.
 *
 * The gap is left at 0 while a text field has focus, where the keyboard
 * legitimately covers the bottom of the screen and nothing should ride up on
 * it, and while the page is pinch-zoomed.
 */
export default function ViewportPin() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    let last = 0;

    const update = () => {
      frame = 0;
      const gap = viewportGap(
        { height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale },
        window.innerHeight,
        isTextEntry(document.activeElement),
      );
      if (gap === last) return;
      last = gap;
      if (gap) root.style.setProperty("--vv-gap", `${gap}px`);
      else root.style.removeProperty("--vv-gap");
    };
    // A frame later, so a focusout reads the element focus moved to, not the field it left.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    schedule();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      root.style.removeProperty("--vv-gap");
    };
  }, []);
  return null;
}

/**
 * Pixels to move a `bottom: 0` fixed element down so it meets the bottom of
 * the visual viewport: positive when it floats above the edge, negative when
 * it hangs below. A `bottom: 0` element is drawn at `innerHeight - offsetTop`
 * in visual-viewport coordinates; the screen's bottom is at `height`.
 */
export function viewportGap(
  vv: { height: number; offsetTop: number; scale: number },
  innerHeight: number,
  typing: boolean,
): number {
  if (typing || Math.abs(vv.scale - 1) > 0.01) return 0;
  const gap = Math.round(vv.height + vv.offsetTop - innerHeight);
  return Math.abs(gap) <= 1 ? 0 : gap; // subpixel toolbar rounding is not a float
}

function isTextEntry(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color", "image", "hidden"].includes(el.type);
}

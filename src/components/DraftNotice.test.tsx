// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DraftNotice from "./DraftNotice";

const noop = () => {};

describe("DraftNotice", () => {
  it("renders nothing visible when there is no draft", () => {
    // Not `container` — the live region is mounted unconditionally (see
    // "keeps the live region mounted" below), so the container itself is
    // never empty. This checks the visible content is, which is the part
    // that matters here.
    render(<DraftNotice draft={{ status: "none" }} onRestore={noop} onDiscard={noop} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces a restore politely, since it happened without being asked", () => {
    render(<DraftNotice draft={{ status: "restored", at: Date.now() }} onRestore={noop} onDiscard={noop} />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("aria-live", "polite");
    expect(notice).toHaveTextContent(/kept what you had written/i);
  });

  it("offers restore and discard when a draft is waiting", async () => {
    // Fake timers so the arm-then-confirm pair clears the ARM_MIN_MS cooldown
    // (see "DraftNotice discard confirmation") instead of landing as one
    // too-fast gesture in real, near-zero jsdom time.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    render(<DraftNotice draft={{ status: "offered", at: Date.now(), fields: {} }} onRestore={onRestore} onDiscard={onDiscard} />);
    expect(screen.getByRole("status")).toHaveTextContent(/unsaved changes/i);
    await user.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledOnce();
    // Discard arms on the first tap, same as in "restored" mode — see the
    // "DraftNotice discard confirmation" describe block below.
    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(onDiscard).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(400); });
    await user.click(screen.getByRole("button", { name: /tap again to discard/i }));
    expect(onDiscard).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("does not offer restore for an already-restored draft", () => {
    render(<DraftNotice draft={{ status: "restored", at: Date.now() }} onRestore={noop} onDiscard={noop} />);
    expect(screen.queryByRole("button", { name: /restore/i })).toBeNull();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });

  it("carries a machine-readable timestamp", () => {
    const at = Date.UTC(2026, 7, 18, 12, 0, 0);
    render(<DraftNotice draft={{ status: "restored", at }} onRestore={noop} onDiscard={noop} />);
    expect(screen.getByRole("status").querySelector("time")).toHaveAttribute("datetime", new Date(at).toISOString());
  });

  it("announces politely in the offered state too, not only when restored", () => {
    render(<DraftNotice draft={{ status: "offered", at: Date.now(), fields: {} }} onRestore={noop} onDiscard={noop} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  // The live region must exist BEFORE it has anything to say. If the component
  // returns null while there is no draft, the region arrives as a brand-new
  // subtree already containing its text, which several screen readers do not
  // announce — and in restore mode that announcement is the only signal the
  // text came back at all.
  it("keeps the live region mounted while there is no draft", () => {
    render(<DraftNotice draft={{ status: "none" }} onRestore={noop} onDiscard={noop} />);
    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toBeEmptyDOMElement();
  });
});

describe("DraftNotice discard confirmation", () => {
  it("arms on the first tap and only discards on the second", async () => {
    // Fake timers so the two taps clear the ARM_MIN_MS cooldown rather than
    // landing within it, the way two real jsdom clicks otherwise would.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDiscard = vi.fn();
    render(<DraftNotice draft={{ status: "restored", at: Date.now() }} onRestore={noop} onDiscard={onDiscard} />);

    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(onDiscard).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(400); });
    const armedButton = screen.getByRole("button", { name: /tap again to discard/i });
    await user.click(armedButton);
    expect(onDiscard).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("ignores a confirm that arrives too fast to be a second decision", async () => {
    // A double-click, and OS key-repeat from a held Enter, both deliver two
    // click events milliseconds apart. Without the cooldown one gesture both
    // arms and confirms, and the confirmation protects nothing.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDiscard = vi.fn();
    render(<DraftNotice draft={{ status: "restored", at: Date.now() }} onRestore={noop} onDiscard={onDiscard} />);

    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    await user.click(screen.getByRole("button", { name: /tap again to discard/i }));
    expect(onDiscard).not.toHaveBeenCalled();

    // Still armed, so a real second press lands.
    await act(async () => { vi.advanceTimersByTime(400); });
    await user.click(screen.getByRole("button", { name: /tap again to discard/i }));
    expect(onDiscard).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("disarms when the notice starts describing a different draft", async () => {
    // Same status, different draft — reachable when useFormDraft's mount effect
    // moves an unremounted component from one scope's offered draft to another's.
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    const first = { status: "offered" as const, at: 1_000, fields: {} };
    const second = { status: "offered" as const, at: 2_000, fields: {} };
    const { rerender } = render(<DraftNotice draft={first} onRestore={noop} onDiscard={onDiscard} />);

    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(screen.getByRole("button", { name: /tap again to discard/i })).toBeInTheDocument();

    rerender(<DraftNotice draft={second} onRestore={noop} onDiscard={onDiscard} />);
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("disarms itself after a few seconds so a stray tap leaves nothing loaded", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDiscard = vi.fn();
    render(<DraftNotice draft={{ status: "restored", at: Date.now() }} onRestore={noop} onDiscard={onDiscard} />);

    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(screen.getByRole("button", { name: /tap again to discard/i })).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(onDiscard).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("ago() boundaries", () => {
  // Rounding rather than flooring skips a whole bucket at the top of each unit:
  // 59m59s renders as "1 hr ago" without ever having said "59 min ago". Pure
  // arithmetic, and it ships byte-identical into nine more apps.
  const now = Date.UTC(2026, 7, 18, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it.each([
    [59 * 1000, /moments ago/],
    [59 * 60 * 1000 + 59 * 1000, /59 min ago/],
    [60 * 60 * 1000, /1 hr ago/],
    [23 * 60 * 60 * 1000 + 59 * 60 * 1000, /23 hr ago/],
    [24 * 60 * 60 * 1000, /yesterday/],
    [3 * 24 * 60 * 60 * 1000, /3 d ago/],
  ])("renders the right unit %i ms after the fact", (elapsed, expected) => {
    render(<DraftNotice draft={{ status: "restored", at: now - elapsed }} onRestore={noop} onDiscard={noop} />);
    expect(screen.getByRole("status")).toHaveTextContent(expected);
  });
});

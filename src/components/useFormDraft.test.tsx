// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { draftKey, fieldsDiffer, serializeDraft } from "../lib/form-draft";
import { readFormFields, writeFormFields, formPort, useFormDraft, type DraftMode } from "./useFormDraft";

function form(html: string): HTMLFormElement {
  const el = document.createElement("form");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

// `form()` above attaches its element straight to `document.body`, and
// testing-library's `cleanup()` (registered globally in vitest.setup.ts) only
// unmounts trees mounted through `render()` — it never sees these. Left
// unremoved, a later test's `<input type="reset">` or `type="image">` (both
// carry an implicit `button` role) collides with `screen.getByRole("button")`
// in the useFormDraft describe block below.
afterEach(() => {
  document.body.replaceChildren();
});

describe("readFormFields", () => {
  it("reads every named text-bearing control", () => {
    const f = form(`
      <input name="title" value="Roof">
      <textarea name="note">soon</textarea>
      <select name="kind"><option value="a" selected>a</option></select>
    `);
    expect(readFormFields(f)).toEqual({ title: "Roof", note: "soon", kind: "a" });
  });

  it("keeps hidden inputs, because a chip input's hidden field IS the typing", () => {
    const f = form(`<input type="hidden" name="tags" value="a,b">`);
    expect(readFormFields(f)).toEqual({ tags: "a,b" });
  });

  /** React writes its own hidden inputs into every form that carries a server
   *  action, and the hash in the name is part of the BUILD — so it rotates on
   *  every deploy. Stored, it would make a draft permanently unequal to its own
   *  page, and no `exclude` list can name a field whose name nobody knows. */
  it("never reads React's own action fields, whatever they are named", () => {
    const f = form(`
      <input type="hidden" name="$ACTION_ID_9c1f0a" value="a-server-reference">
      <input type="hidden" name="$ACTION_REF_1" value="ref">
      <input type="hidden" name="$ACTION_KEY" value="k">
      <input name="title" value="Roof">
    `);
    expect(readFormFields(f)).toEqual({ title: "Roof" });
  });

  it("does not let a redeploy's new action hash look like an edit", () => {
    const before = readFormFields(form(`
      <input type="hidden" name="$ACTION_ID_9c1f0a" value="ref-one">
      <input name="title" value="Roof">
    `));
    // The same page after a deploy: same words, a different hash.
    const after = readFormFields(form(`
      <input type="hidden" name="$ACTION_ID_44be27" value="ref-two">
      <input name="title" value="Roof">
    `));
    expect(fieldsDiffer(after, before)).toBe(false);
  });

  it("never reads a password or a file input", () => {
    const f = form(`
      <input type="password" name="pw" value="hunter2">
      <input type="file" name="upload">
      <input name="ok" value="yes">
    `);
    expect(readFormFields(f)).toEqual({ ok: "yes" });
  });

  it("never reads a credential-shaped name whatever its type", () => {
    const f = form(`<input name="setupToken" value="sk-1"><input name="ok" value="yes">`);
    expect(readFormFields(f)).toEqual({ ok: "yes" });
  });

  it("honours an explicit exclude list", () => {
    const f = form(`<input name="derived" value="x"><input name="ok" value="yes">`);
    expect(readFormFields(f, ["derived"])).toEqual({ ok: "yes" });
  });

  it("skips unnamed controls", () => {
    const f = form(`<input value="anonymous"><input name="ok" value="yes">`);
    expect(readFormFields(f)).toEqual({ ok: "yes" });
  });

  it("reads a checkbox as its checked state, not its value attribute", () => {
    const f = form(`<input type="checkbox" name="notify" checked>`);
    expect(readFormFields(f)).toEqual({ notify: "true" });
  });

  it("returns nothing for a null form rather than throwing", () => {
    expect(readFormFields(null)).toEqual({});
  });
});

describe("writeFormFields", () => {
  it("writes values back into matching controls", () => {
    const f = form(`<input name="title"><textarea name="note"></textarea>`);
    writeFormFields(f, { title: "Roof", note: "soon" });
    expect((f.elements.namedItem("title") as HTMLInputElement).value).toBe("Roof");
    expect((f.elements.namedItem("note") as HTMLTextAreaElement).value).toBe("soon");
  });

  it("restores a checkbox from its stored state", () => {
    const f = form(`<input type="checkbox" name="notify">`);
    writeFormFields(f, { notify: "true" });
    expect((f.elements.namedItem("notify") as HTMLInputElement).checked).toBe(true);
  });

  it("ignores fields the form no longer has", () => {
    const f = form(`<input name="title">`);
    expect(() => writeFormFields(f, { gone: "x" })).not.toThrow();
  });

  it("never writes into a password or file input", () => {
    const f = form(`<input type="password" name="pw"><input type="file" name="upload">`);
    writeFormFields(f, { pw: "hunter2", upload: "/etc/passwd" });
    expect((f.elements.namedItem("pw") as HTMLInputElement).value).toBe("");
  });

  it("does nothing for a null form rather than throwing", () => {
    expect(() => writeFormFields(null, { a: "1" })).not.toThrow();
  });
});

// Controls that share a name. Every case here is silently corrupted by the
// obvious per-element implementation, and all of them occur in the fleet:
// repeating rows in tide's split editor, checkbox groups in passage's planner.
describe("React's own action fields, on the write side", () => {
  it("never writes into one, even when a stale draft names it", () => {
    const f = form(`
      <input type="hidden" name="$ACTION_ID_9c1f0a" value="untouched">
      <input name="title" value="">
    `);
    writeFormFields(f, { "$ACTION_ID_9c1f0a": "poison", title: "Roof" });
    expect((f.elements.namedItem("$ACTION_ID_9c1f0a") as HTMLInputElement).value).toBe("untouched");
    expect((f.elements.namedItem("title") as HTMLInputElement).value).toBe("Roof");
  });
});

describe("same-named control groups", () => {
  it("round-trips a repeating group of text inputs without clobbering", () => {
    const f = form(`<input name="item" value="a"><input name="item" value="b">`);
    const read = readFormFields(f);
    expect(read).toEqual({ "item[0]": "a", "item[1]": "b" });

    const g = form(`<input name="item"><input name="item">`);
    writeFormFields(g, read);
    const inputs = g.querySelectorAll<HTMLInputElement>('input[name="item"]');
    expect([inputs[0].value, inputs[1].value]).toEqual(["a", "b"]);
  });

  it("round-trips a checkbox group by per-member checked state", () => {
    const f = form(`
      <input type="checkbox" name="tags" value="a" checked>
      <input type="checkbox" name="tags" value="b">
      <input type="checkbox" name="tags" value="c" checked>
    `);
    const read = readFormFields(f);
    expect(read).toEqual({ "tags[0]": "true", "tags[1]": "false", "tags[2]": "true" });

    const g = form(`
      <input type="checkbox" name="tags" value="a">
      <input type="checkbox" name="tags" value="b" checked>
      <input type="checkbox" name="tags" value="c">
    `);
    writeFormFields(g, read);
    const boxes = g.querySelectorAll<HTMLInputElement>('input[name="tags"]');
    expect([boxes[0].checked, boxes[1].checked, boxes[2].checked]).toEqual([true, false, true]);
  });

  it("treats a radio group as one value and restores the right member", () => {
    const f = form(`
      <input type="radio" name="kind" value="a">
      <input type="radio" name="kind" value="b" checked>
    `);
    expect(readFormFields(f)).toEqual({ kind: "b" });

    const g = form(`
      <input type="radio" name="kind" value="a" checked>
      <input type="radio" name="kind" value="b">
    `);
    writeFormFields(g, { kind: "b" });
    const radios = g.querySelectorAll<HTMLInputElement>('input[name="kind"]');
    expect([radios[0].checked, radios[1].checked]).toEqual([false, true]);
  });

  it("reads an unselected radio group as empty and clears one on restore", () => {
    const f = form(`
      <input type="radio" name="kind" value="a">
      <input type="radio" name="kind" value="b">
    `);
    expect(readFormFields(f)).toEqual({ kind: "" });

    const g = form(`<input type="radio" name="kind" value="a" checked>`);
    writeFormFields(g, { kind: "" });
    expect(g.querySelector<HTMLInputElement>('input[name="kind"]')!.checked).toBe(false);
  });

  it("drops group members that no longer exist instead of throwing", () => {
    const g = form(`<input name="item">`);
    expect(() => writeFormFields(g, { "item[0]": "a", "item[1]": "b" })).not.toThrow();
    expect(g.querySelector<HTMLInputElement>('input[name="item"]')!.value).toBe("a");
  });

  it("restores a field whose own name ends in [n] rather than reading it as an index", () => {
    // `row[2]` is a legitimate field name (Rails and PHP both emit it). Split
    // into base `row` + index 2 it resolves to a group that does not exist and
    // the write is silently dropped, losing a field sitting right there.
    const f = form(`<input name="row[2]" value="kept">`);
    expect(readFormFields(f)).toEqual({ "row[2]": "kept" });

    const g = form(`<input name="row[2]">`);
    writeFormFields(g, { "row[2]": "kept" });
    expect(g.querySelector<HTMLInputElement>('input[name="row\\[2\\]"]')!.value).toBe("kept");
  });

  it("still indexes a real group when a bracketed literal name is also present", () => {
    const g = form(`
      <input name="item"><input name="item">
      <input name="row[2]">
    `);
    writeFormFields(g, { "item[0]": "a", "item[1]": "b", "row[2]": "kept" });
    const items = g.querySelectorAll<HTMLInputElement>('input[name="item"]');
    expect([items[0].value, items[1].value]).toEqual(["a", "b"]);
    expect(g.querySelector<HTMLInputElement>('input[name="row\\[2\\]"]')!.value).toBe("kept");
  });
});

describe("multi-selects", () => {
  it("keeps every selected option, not just the first", () => {
    const f = form(`
      <select name="tags" multiple>
        <option value="a" selected>a</option>
        <option value="b">b</option>
        <option value="c" selected>c</option>
      </select>
    `);
    expect(readFormFields(f)).toEqual({ tags: JSON.stringify(["a", "c"]) });
  });

  it("restores every selected option", () => {
    const f = form(`
      <select name="tags" multiple>
        <option value="a">a</option>
        <option value="b" selected>b</option>
        <option value="c">c</option>
      </select>
    `);
    writeFormFields(f, { tags: JSON.stringify(["a", "c"]) });
    const opts = f.querySelectorAll<HTMLOptionElement>("option");
    expect([opts[0].selected, opts[1].selected, opts[2].selected]).toEqual([true, false, true]);
  });

  it("leaves the control alone when the stored shape is not an array", () => {
    const f = form(`<select name="tags" multiple><option value="a" selected>a</option></select>`);
    writeFormFields(f, { tags: "not json" });
    expect(f.querySelector<HTMLOptionElement>("option")!.selected).toBe(true);
  });
});

describe("write-side name guard", () => {
  it("refuses to write a credential-shaped name into a live control", () => {
    const f = form(`<input name="apiKey">`);
    writeFormFields(f, { apiKey: "sk-leaked" });
    expect((f.elements.namedItem("apiKey") as HTMLInputElement).value).toBe("");
  });
});

describe("label-bearing controls", () => {
  it("never stores a reset or image button's value, which is a label", () => {
    const f = form(`
      <input type="reset" name="reset">
      <input type="image" name="pick" value="Go">
      <input name="ok" value="yes">
    `);
    expect(readFormFields(f)).toEqual({ ok: "yes" });
  });
});

function Uncontrolled({ scope, mode, initial = "" }: { scope: string; mode: DraftMode; initial?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  // eslint-disable-next-line react-hooks/refs -- formPort never reads ref.current itself; it closes over the ref and dereferences it inside the snapshot/apply callbacks, which useFormDraft only invokes from event handlers, timers and effects, never during render.
  const draft = useFormDraft({ scope, mode, ...formPort(formRef) });
  return (
    <>
      <output data-testid="status">{draft.state.status}</output>
      <button type="button" onClick={draft.restore}>restore</button>
      <button type="button" onClick={draft.discard}>discard</button>
      <button type="button" onClick={draft.clear}>clear</button>
      <form ref={formRef}>
        <input name="title" defaultValue={initial} aria-label="title" />
      </form>
    </>
  );
}

/** A form as React actually renders one when it carries a server action: the
 *  fields someone types into, plus a hidden reference whose NAME carries a
 *  per-build hash. `actionId` is what changes across a deploy. */
function ActionForm({ scope, actionId }: { scope: string; actionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  // eslint-disable-next-line react-hooks/refs -- formPort never reads ref.current itself; it closes over the ref and dereferences it inside the snapshot/apply callbacks, which useFormDraft only invokes from event handlers, timers and effects, never during render.
  const draft = useFormDraft({ scope, mode: "restore", ...formPort(formRef) });
  return (
    <>
      <output data-testid="status">{draft.state.status}</output>
      <form ref={formRef}>
        <input type="hidden" name={actionId} defaultValue="a-server-reference" />
        <input name="title" defaultValue="" aria-label="title" />
      </form>
    </>
  );
}

function Controlled({ scope, mode, initial = "" }: { scope: string; mode: DraftMode; initial?: string }) {
  const draft = useFormDraft({ scope, mode });
  const [title, setTitle] = draft.field("title", initial);
  return (
    <>
      <output data-testid="status">{draft.state.status}</output>
      <button type="button" onClick={draft.restore}>restore</button>
      <input aria-label="title" value={title} onChange={(e) => setTitle(e.target.value)} />
    </>
  );
}

function stored(scope: string) {
  return window.localStorage.getItem(draftKey(scope));
}

function seed(scope: string, fields: Record<string, string>, at = Date.now()) {
  window.localStorage.setItem(draftKey(scope), serializeDraft(fields, at)!);
}

describe("useFormDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  // StrictMode fakes an unmount and re-runs the mount effect on the SAME
  // component instance, so refs and the DOM both survive it. Without
  // `priorBaseline` the second run re-read an uncontrolled form that already
  // held the restored text, found the draft equal to its own baseline, and
  // deleted it — in `next dev` only, which is why a production-build check
  // could never see it. The controlled case is the control: it never broke,
  // because `registered.current` still holds the pre-restore values.
  it("throws away a draft that has caught up with the page, across a redeploy", async () => {
    // Written by the build BEFORE this one — same words as the page now shows,
    // and an action id whose hash has since rotated. The whole point of
    // `!fieldsDiffer -> safeRemove` is that such a draft is noise; storing
    // React's own field is what used to make it look like an edit forever.
    seed("t:new", { title: "", "$ACTION_ID_9c1f0a": "ref-one" });
    render(<ActionForm scope="t:new" actionId="$ACTION_ID_44be27" />);
    expect(screen.getByTestId("status").textContent).toBe("none");
    expect(stored("t:new")).toBeNull();
  });

  it("writes no action field into a new draft", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ActionForm scope="t:new" actionId="$ACTION_ID_44be27" />);
    await user.type(screen.getByLabelText("title"), "Roof");
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(JSON.parse(stored("t:new")!).fields).toEqual({ title: "Roof" });
  });

  it("survives StrictMode's doubled mount effect on an uncontrolled surface", () => {
    seed("t:new", { title: "Roof" });
    render(
      <StrictMode>
        <Uncontrolled scope="t:new" mode="restore" />
      </StrictMode>,
    );
    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("Roof");
    expect(screen.getByTestId("status").textContent).toBe("restored");
    expect(stored("t:new")).not.toBeNull();
  });

  it("survives StrictMode's doubled mount effect on a controlled surface", () => {
    seed("t2:new", { title: '"Roof"' });
    render(
      <StrictMode>
        <Controlled scope="t2:new" mode="restore" />
      </StrictMode>,
    );
    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("Roof");
    expect(screen.getByTestId("status").textContent).toBe("restored");
    expect(stored("t2:new")).not.toBeNull();
  });

  it("keeps what is typed into an uncontrolled form, debounced", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Uncontrolled scope="t:new" mode="restore" />);
    await user.type(screen.getByLabelText("title"), "Roof");
    expect(stored("t:new")).toBeNull();          // still inside the debounce
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(JSON.parse(stored("t:new")!).fields).toEqual({ title: "Roof" });
  });

  it("flushes on pagehide without waiting for the debounce", async () => {
    const user = userEvent.setup();
    render(<Uncontrolled scope="t:new" mode="restore" />);
    await user.type(screen.getByLabelText("title"), "Roof");
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expect(JSON.parse(stored("t:new")!).fields).toEqual({ title: "Roof" });
  });

  it("flushes when the page is hidden", async () => {
    const user = userEvent.setup();
    render(<Uncontrolled scope="t:new" mode="restore" />);
    await user.type(screen.getByLabelText("title"), "Roof");
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(JSON.parse(stored("t:new")!).fields).toEqual({ title: "Roof" });
  });

  it("puts the text straight back in restore mode", () => {
    seed("t:new", { title: "Roof" });
    render(<Uncontrolled scope="t:new" mode="restore" />);
    expect(screen.getByLabelText("title")).toHaveValue("Roof");
    expect(screen.getByTestId("status")).toHaveTextContent("restored");
  });

  it("holds the draft back in offer mode until it is taken", async () => {
    const user = userEvent.setup();
    seed("t:1", { title: "Draft" });
    render(<Uncontrolled scope="t:1" mode="offer" initial="Saved" />);
    expect(screen.getByLabelText("title")).toHaveValue("Saved");
    expect(screen.getByTestId("status")).toHaveTextContent("offered");
    await user.click(screen.getByText("restore"));
    expect(screen.getByLabelText("title")).toHaveValue("Draft");
    expect(screen.getByTestId("status")).toHaveTextContent("restored");
  });

  it("does not announce a draft that says what the page already said", () => {
    seed("t:1", { title: "Saved" });
    render(<Uncontrolled scope="t:1" mode="offer" initial="Saved" />);
    expect(screen.getByTestId("status")).toHaveTextContent("none");
    expect(stored("t:1")).toBeNull();
  });

  it("does not touch storage in offer mode before a decision is made", async () => {
    seed("t:1", { title: "Draft" });
    render(<Uncontrolled scope="t:1" mode="offer" initial="Saved" />);
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expect(JSON.parse(stored("t:1")!).fields).toEqual({ title: "Draft" });
  });

  // The scenario this module exists for, arriving through the guard meant to
  // protect it: someone opens an edit surface with a draft on offer, ignores
  // the notice, retypes the field, and backgrounds the app. If the offer keeps
  // holding storage still, the new words are never written anywhere and the
  // stale draft is offered again on return.
  it("lets new typing supersede an unanswered offer, in a controlled form", async () => {
    const user = userEvent.setup();
    // `field()` values are JSON, which is what the controlled adapter stores.
    seed("c:1", { title: JSON.stringify("Draft") });
    render(<Controlled scope="c:1" mode="offer" initial="Saved" />);
    expect(screen.getByTestId("status")).toHaveTextContent("offered");

    await user.clear(screen.getByLabelText("title"));
    await user.type(screen.getByLabelText("title"), "Retyped");
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expect(JSON.parse(stored("c:1")!).fields).toEqual({ title: JSON.stringify("Retyped") });

    // And the offer is not destroyed by that — it lives on in React state, so
    // restore still reaches the older text from memory. This half is why the
    // fix is a supersede flag and not "skip the safeRemove branch while
    // offered": that would leave `draft.fields` staler than storage and restore
    // would apply the older text over the newer.
    expect(screen.getByTestId("status")).toHaveTextContent("offered");
    await user.click(screen.getByText("restore"));
    expect(screen.getByLabelText("title")).toHaveValue("Draft");
  });

  // The same bug through the other port. Uncontrolled typing changes the DOM
  // WITHOUT re-rendering, so the post-render check never runs and cannot be
  // what notices — `save` has to be able to notice on its own.
  it("lets new typing supersede an unanswered offer, in an uncontrolled form", async () => {
    const user = userEvent.setup();
    seed("t:1", { title: "Draft" });
    render(<Uncontrolled scope="t:1" mode="offer" initial="Saved" />);
    expect(screen.getByTestId("status")).toHaveTextContent("offered");

    await user.clear(screen.getByLabelText("title"));
    await user.type(screen.getByLabelText("title"), "Retyped");
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expect(JSON.parse(stored("t:1")!).fields).toEqual({ title: "Retyped" });

    expect(screen.getByTestId("status")).toHaveTextContent("offered");
    await user.click(screen.getByText("restore"));
    expect(screen.getByLabelText("title")).toHaveValue("Draft");
  });

  // A route param moving from one record to the next re-runs the mount effect
  // WITHOUT remounting the component. If the new scope has nothing to offer and
  // the effect just returns, the PREVIOUS record's notice stays on screen and
  // stays restorable — one tap from pouring one record's text into another
  // record's form. Not reachable in tide, whose row list is keyed by id, but
  // reachable on any surface whose scope comes from the route.
  it("drops the previous record's offer when the scope moves to one with no draft", async () => {
    const user = userEvent.setup();
    seed("t:1", { title: "Draft" });
    const { rerender } = render(<Uncontrolled scope="t:1" mode="offer" initial="Saved" />);
    expect(screen.getByTestId("status")).toHaveTextContent("offered");

    rerender(<Uncontrolled scope="t:2" mode="offer" initial="Saved" />);
    expect(screen.getByTestId("status")).toHaveTextContent("none");

    // The state is what makes this matter, not the label: restore must now be
    // inert rather than writing record 1's words into record 2's form.
    await user.click(screen.getByText("restore"));
    expect(screen.getByLabelText("title")).toHaveValue("Saved");
    expect(stored("t:2")).toBeNull();
  });

  // The post-render path exists for values that change with no DOM event, and
  // an offer standing over one is where it nearly did nothing: the render that
  // flips the supersede latch used to consume the "first settled render" slot
  // and schedule nothing, so the FIRST click was never persisted and only the
  // second one was. The `input` listener hides this for anything typed, which
  // is why the case has to be a button.
  it("persists the FIRST button-driven change made over an unanswered offer", async () => {
    function Numeric({ scope }: { scope: string }) {
      const draft = useFormDraft({ scope, mode: "offer" });
      const [n, setN] = draft.field("count", 0);
      return (
        <>
          <output data-testid="status">{draft.state.status}</output>
          <button type="button" onClick={() => setN(n + 1)}>count {n}</button>
        </>
      );
    }
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    seed("n:1", { count: "5" });
    render(<Numeric scope="n:1" />);
    expect(screen.getByTestId("status")).toHaveTextContent("offered");

    await user.click(screen.getByRole("button"));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(JSON.parse(stored("n:1")!).fields).toEqual({ count: "1" });
  });

  it("discard puts a restored form back to what it shipped with", async () => {
    const user = userEvent.setup();
    seed("t:new", { title: "Roof" });
    render(<Uncontrolled scope="t:new" mode="restore" initial="" />);
    await user.click(screen.getByText("discard"));
    expect(screen.getByLabelText("title")).toHaveValue("");
    expect(stored("t:new")).toBeNull();
    expect(screen.getByTestId("status")).toHaveTextContent("none");
  });

  // `discard` used to go straight to `safeRemove`, leaving the debounce armed
  // by the last keystroke still pending. 400 is written as a LITERAL here and
  // everywhere else in this file on purpose: `SAVE_DEBOUNCE_MS` is not exported,
  // and a test that derived its own wait from the constant could never pin it.
  it("disarms the pending debounce, so nothing can save after a discard", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    seed("t:new", { title: "Roof" });
    render(<Uncontrolled scope="t:new" mode="restore" />);
    await user.type(screen.getByLabelText("title"), "!"); // arms the debounce
    await user.click(screen.getByText("discard"));

    // THE SPIES ARE WHAT DISCRIMINATES, not the emptiness of the key. `discard`
    // also requests a rebaseline, so by the time a stale timer fires the fields
    // already equal the new baseline and `save` takes its `!fieldsDiffer ->
    // safeRemove` branch — the key reads empty either way. What differs is that
    // a discarded surface must not touch storage AT ALL afterwards: unfixed,
    // that branch calls `removeItem` ~400ms after the words were thrown away,
    // and on any surface whose snapshot has moved on by then (a scope change
    // mid-window, an `apply` from the mount effect) the same save writes
    // instead — under the OLD key, because the armed callback closed over it.
    const removed = vi.spyOn(Storage.prototype, "removeItem");
    const wrote = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(removed).not.toHaveBeenCalled();
    expect(wrote).not.toHaveBeenCalled();
    expect(stored("t:new")).toBeNull();
    removed.mockRestore();
    wrote.mockRestore();
  });

  it("clear removes the draft and leaves the fields alone", async () => {
    const user = userEvent.setup();
    seed("t:new", { title: "Roof" });
    render(<Uncontrolled scope="t:new" mode="restore" />);
    await user.click(screen.getByText("clear"));
    expect(stored("t:new")).toBeNull();
    expect(screen.getByLabelText("title")).toHaveValue("Roof");
  });

  it("sweeps this origin's aged keys on mount", () => {
    seed("t:ancient", { title: "old" }, Date.now() - 91 * 24 * 60 * 60 * 1000);
    window.localStorage.setItem("someone-elses:key", "keep me");
    render(<Uncontrolled scope="t:new" mode="restore" />);
    expect(stored("t:ancient")).toBeNull();
    expect(window.localStorage.getItem("someone-elses:key")).toBe("keep me");
  });

  it("keeps and restores controlled state through field()", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<Controlled scope="c:new" mode="restore" />);
    await user.type(screen.getByLabelText("title"), "Roof");
    await act(async () => { vi.advanceTimersByTime(400); });
    unmount();
    render(<Controlled scope="c:new" mode="restore" />);
    expect(screen.getByLabelText("title")).toHaveValue("Roof");
  });

  // A button-driven value is the case a document-level input/change listener
  // CANNOT see, and DESIGN.md makes it the fleet's common case rather than an
  // edge one: a checkbox here is a <button> toggle, ratings are button pickers,
  // colours are swatches, chips are added by click. If this fails, the
  // post-render snapshot check is missing or broken — do NOT repair it by giving
  // the test a text input it deliberately does not have.
  it("keeps a non-string value changed by a button, with no DOM input event", async () => {
    function Numeric() {
      const draft = useFormDraft({ scope: "n:new", mode: "restore" });
      const [n, setN] = draft.field("count", 0);
      return <button type="button" onClick={() => setN(n + 1)}>count {n}</button>;
    }
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<Numeric />);
    await user.click(screen.getByRole("button"));
    await act(async () => { vi.advanceTimersByTime(400); });
    unmount();
    render(<Numeric />);
    expect(screen.getByRole("button")).toHaveTextContent("count 1");
  });

  it("does not resurrect the draft after clear() when the form stays mounted", async () => {
    // Submitting successfully and staying on the page is the ordinary shape in
    // this fleet — most actions run inside startTransition and never navigate.
    // Without a rebaseline, the post-render check reads the still-populated
    // fields as a fresh edit and writes the draft straight back.
    function Stayer() {
      const draft = useFormDraft({ scope: "s:new", mode: "restore" });
      const [title, setTitle] = draft.field("title", "");
      return (
        <>
          <input aria-label="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="button" onClick={draft.clear}>saved</button>
        </>
      );
    }
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Stayer />);
    await user.type(screen.getByLabelText("title"), "Roof");
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(stored("s:new")).not.toBeNull();

    await user.click(screen.getByText("saved"));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(stored("s:new")).toBeNull();

    // The pagehide flush is what makes this test DISCRIMINATE, and without it
    // the test passes against the broken implementation too. `clear()` changes
    // no field value, so the post-render check finds the snapshot unchanged and
    // schedules nothing either way — the staleness only becomes visible when
    // something forces a save that diffs against `baseline.current`. Backgrounding
    // the page is that something, and it is exactly what a user does after
    // saving. Without the rebaseline, `baseline` is still the ORIGINAL empty
    // form, the flush sees "Roof" as an unsaved edit, and the draft comes back.
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expect(stored("s:new")).toBeNull();
    expect(screen.getByLabelText("title")).toHaveValue("Roof");
  });

  it("survives localStorage throwing, as in Safari private mode", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const user = userEvent.setup();
    render(<Uncontrolled scope="t:new" mode="restore" />);
    await user.type(screen.getByLabelText("title"), "Roof");
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expect(screen.getByLabelText("title")).toHaveValue("Roof");
    spy.mockRestore();
  });
});

/** A `useActionState`-shaped surface: the form's own reset is React's post-action
 *  reset, and `onReset` is wired the way every such form must wire it. */
function ResetForm({ scope }: { scope: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  // eslint-disable-next-line react-hooks/refs -- formPort never reads ref.current itself; it closes over the ref and dereferences it inside the snapshot/apply callbacks, which useFormDraft only invokes from event handlers, timers and effects, never during render.
  const draft = useFormDraft({ scope, mode: "restore", ...formPort(formRef) });
  return (
    <>
      <button type="button" onClick={draft.onSubmit}>submit</button>
      <button type="button" onClick={draft.recoverAfterFailedSave}>recover</button>
      <button type="button" onClick={draft.clear}>clear</button>
      <button type="button" onClick={draft.discard}>discard</button>
      <button type="button" onClick={() => formRef.current?.reset()}>reset</button>
      <form ref={formRef} onReset={draft.onReset}>
        <input name="title" defaultValue="" aria-label="title" />
      </form>
    </>
  );
}

// React's post-action reset and the effect that calls `recoverAfterFailedSave`
// are not ordered against each other. When the reset lands SECOND, the recovery
// ran against a form that was still full, did nothing, and the reset then blanked
// the box under the error asking for another try. The ORDER below is that losing
// order — submit, recover, then reset — so an `onReset` that does not refuse the
// reset reads "" here, which is what makes these tests discriminate.
describe("useFormDraft onReset", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  async function typeAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("title"), "Roof");
    await user.click(screen.getByText("submit"));
  }

  it("lets a reset through when no refusal has been recovered from", async () => {
    const user = userEvent.setup();
    render(<ResetForm scope="reset-a" />);
    await user.type(screen.getByLabelText("title"), "Roof");
    await user.click(screen.getByText("reset"));
    expect(screen.getByLabelText("title")).toHaveValue("");
  });

  it("refuses the form's reset when it lands AFTER the recovery", async () => {
    const user = userEvent.setup();
    render(<ResetForm scope="reset-b" />);
    await typeAndSubmit(user);
    await user.click(screen.getByText("recover"));
    await user.click(screen.getByText("reset"));
    expect(screen.getByLabelText("title")).toHaveValue("Roof");
  });

  // Each of these ends the refused attempt, so the guard must not outlive it:
  // a successful retry's own reset would otherwise be cancelled and the sent
  // text would sit in the box looking unsent.
  it.each(["submit", "clear", "discard"])("stands the guard down on %s", async (label) => {
    const user = userEvent.setup();
    render(<ResetForm scope={`reset-${label}`} />);
    await typeAndSubmit(user);
    await user.click(screen.getByText("recover"));
    await user.click(screen.getByText(label));
    await user.click(screen.getByText("reset"));
    expect(screen.getByLabelText("title")).toHaveValue("");
  });

  it("never arms when there is no stored draft to recover", async () => {
    const user = userEvent.setup();
    render(<ResetForm scope="reset-none" />);
    await user.click(screen.getByText("recover"));
    await user.type(screen.getByLabelText("title"), "Roof");
    await user.click(screen.getByText("reset"));
    expect(screen.getByLabelText("title")).toHaveValue("");
  });
});

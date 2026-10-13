
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  type DraftFields,
  type StoredDraft,
  draftKey,
  expiredKeys,
  fieldsDiffer,
  isSensitiveName,
  parseDraft,
  restorableFields,
  serializeDraft,
} from "../lib/form-draft";

type TextControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Controls whose value must never be stored, whatever they are called. A file
 * input cannot be restored at all — its value is a read-only path the browser
 * will not let us set — and a password has no business in localStorage.
 * `submit`, `button`, `image` and `reset` carry a value that is a LABEL, not
 * content; a reset button's value defaults to the literal string "Reset", which
 * would otherwise land in every draft as noise.
 */
function isUnstorableType(el: TextControl): boolean {
  const type = (el as HTMLInputElement).type;
  return (
    type === "password" ||
    type === "file" ||
    type === "submit" ||
    type === "button" ||
    type === "image" ||
    type === "reset"
  );
}

/**
 * Controls that share a name are a group, and a group needs per-member keys.
 *
 * The obvious implementation writes `fields[el.name]` per element and reads back
 * through `form.elements.namedItem(name)`. Both halves are wrong for a group.
 * The write clobbers: a checkbox group or a repeating row of inputs keeps only
 * whichever member the loop visited last. The read is worse — `namedItem`
 * returns a `RadioNodeList` for ANY shared name, not only for radios, and that
 * list's `value` setter works by matching a member's `value` ATTRIBUTE and
 * setting its checkedness. For same-named text inputs it is a silent no-op; for
 * a checkbox group whose stored value is the checked-state string it matches no
 * member at all and leaves every box unchecked.
 *
 * So multiplicity is decided up front and groups get indexed keys. A group that
 * shrinks between writing the draft and restoring it drops its extra keys
 * through `restorableFields`, which is exactly what that function is for.
 */
const GROUP_KEY = /^(.*)\[(\d+)\]$/;

function groupKey(name: string, index: number): string {
  return `${name}[${index}]`;
}

function isRadioGroup(els: readonly TextControl[]): boolean {
  return els.every((e) => (e as HTMLInputElement).type === "radio");
}

/** Everything shape-specific about reading ONE control. */
function readControl(el: TextControl): string | null {
  if ((el as HTMLInputElement).type === "checkbox") {
    // The checked STATE is the content. Storing the value attribute would
    // restore an unchecked box as checked and lose which one it was.
    return String((el as HTMLInputElement).checked);
  }
  if (el instanceof HTMLSelectElement && el.multiple) {
    // `.value` on a multi-select returns only the FIRST selected option, so a
    // tag or category picker would silently lose every choice but one.
    return JSON.stringify(Array.from(el.selectedOptions, (o) => o.value));
  }
  if (typeof el.value !== "string") return null;
  return el.value;
}

function writeControl(el: TextControl, value: string): void {
  if ((el as HTMLInputElement).type === "checkbox") {
    (el as HTMLInputElement).checked = value === "true";
    return;
  }
  if (el instanceof HTMLSelectElement && el.multiple) {
    let picked: unknown;
    try {
      picked = JSON.parse(value);
    } catch {
      return; // a draft from an older shape — leave the control alone
    }
    if (!Array.isArray(picked)) return;
    const wanted = new Set(picked.map(String));
    for (const opt of Array.from(el.options)) opt.selected = wanted.has(opt.value);
    return;
  }
  el.value = value;
}

/**
 * React's own form plumbing, which must never reach a draft.
 *
 * Every form that can be progressively enhanced — which is every form carrying
 * a server action — gets hidden inputs React writes into it itself, all under a
 * `$ACTION_` prefix: `$ACTION_ID_<hash>`, plus `$ACTION_REF_*` and `$ACTION_KEY`
 * on a bound action. **The hash is part of the build, so it rotates on every
 * deploy.**
 *
 * Store one and the draft can never compare equal to its own page again, which
 * kills the `!fieldsDiffer -> safeRemove` branch in `save` and in the mount
 * effect outright: a draft that has genuinely caught up with the page is
 * offered back instead of being thrown away, and a form someone empties by hand
 * never clears. Found in passage, and it reaches every app in the fleet.
 *
 * This cannot live in `exclude`. The name is different on every deploy, so no
 * per-call-site list can name it — which is also why this is not an arbitrary
 * exclusion to be tidied away later. It is the one field whose NAME is
 * unstable, and it belongs to React rather than to anything anyone typed.
 *
 * Applied on BOTH sides, by sitting in `controlsByName` unconditionally rather
 * than behind `applyNameRules`: a stale draft naming one of these must never be
 * written back into a live form either.
 */
function isReactInternalName(name: string): boolean {
  return name.startsWith("$ACTION_");
}

/**
 * A draft as stored, minus anything React named.
 *
 * The rule above stops NEW drafts carrying an action id. This is for the ones
 * already sitting in a browser, written before it existed: that one key would
 * keep such a draft permanently unequal to its own page — the exact symptom
 * being fixed — so it is dropped on the way in rather than left to poison every
 * comparison until the 90-day sweep. (`safeRead` and `parseDraft` are both
 * hoisted declarations, so this may sit beside the rule it belongs to.)
 */
function readStoredDraft(key: string): StoredDraft | null {
  const stored = parseDraft(safeRead(key));
  if (!stored) return null;
  const names = Object.keys(stored.fields);
  if (!names.some(isReactInternalName)) return stored;
  const fields: DraftFields = {};
  for (const name of names) if (!isReactInternalName(name)) fields[name] = stored.fields[name];
  return { ...stored, fields };
}

/** Named, storable controls grouped by name, in document order. */
function controlsByName(
  form: HTMLFormElement,
  skip: ReadonlySet<string>,
  applyNameRules: boolean,
): Map<string, TextControl[]> {
  const byName = new Map<string, TextControl[]>();
  for (const el of Array.from(form.elements) as TextControl[]) {
    if (!el.name) continue;
    if (isReactInternalName(el.name)) continue;
    if (applyNameRules && (skip.has(el.name) || isSensitiveName(el.name))) continue;
    if (isUnstorableType(el)) continue;
    const list = byName.get(el.name);
    if (list) list.push(el);
    else byName.set(el.name, [el]);
  }
  return byName;
}

/**
 * Every control the writer can actually type into, by name.
 *
 * Hidden inputs are INCLUDED, which reverses idreamofneon's rule. There, hidden
 * fields ride through the form only so a save cannot drop them and are
 * re-derived from the Notes sync on every import, so carrying a stale copy would
 * let a restore quietly revert a sync. Fleet-wide the opposite is true: a
 * ChipInput, a colour list and a custom picker all publish their value through a
 * hidden input, and that value IS what was typed. Forms with an
 * idreamofneon-shaped derived field pass it in `exclude` instead.
 */
export function readFormFields(
  form: HTMLFormElement | null,
  exclude: readonly string[] = [],
): DraftFields {
  const fields: DraftFields = {};
  if (!form) return fields;

  for (const [name, els] of controlsByName(form, new Set(exclude), true)) {
    // A radio group is ONE logical value: whichever member is checked, or the
    // empty string when none is. It never gets indexed keys.
    if (isRadioGroup(els)) {
      const checked = els.find((e) => (e as HTMLInputElement).checked);
      fields[name] = checked ? checked.value : "";
      continue;
    }
    if (els.length === 1) {
      const value = readControl(els[0]);
      if (value !== null) fields[name] = value;
      continue;
    }
    els.forEach((el, i) => {
      const value = readControl(el);
      if (value !== null) fields[groupKey(name, i)] = value;
    });
  }
  return fields;
}

export function writeFormFields(form: HTMLFormElement | null, fields: DraftFields): void {
  if (!form) return;
  const byName = controlsByName(form, new Set(), false);

  for (const [key, value] of Object.entries(fields)) {
    const match = GROUP_KEY.exec(key);
    // A trailing `[n]` counts as OUR index only when the form really does have
    // a group under the base name at all. `row[2]` is a legitimate field name
    // — Rails and PHP both produce it — and reading it as base `row` plus index
    // 2 finds no group called `row`, drops the write, and silently fails to
    // restore a field that is sitting right there. No app in the fleet uses
    // that convention today; this is a primitive that new forms will reach for
    // in years to come, and silent loss is the one failure mode worth spending
    // three lines to rule out.
    //
    // Deliberately `> 0`, not `> 1`: a group that has shrunk to its last
    // member (the "drops group members that no longer exist" case above) is
    // still a group named `item`, and "item[0]" must still resolve into it. A
    // literal `row[2]` is safe regardless of the threshold, because no element
    // is ever named plain `row` on that form — the base name simply does not
    // exist as a group at any size.
    const isIndexed = match !== null && (byName.get(match[1])?.length ?? 0) > 0;
    const name = isIndexed ? match![1] : key;
    const index = isIndexed ? Number(match![2]) : null;

    // Parity with the read side. The guard is one-directional otherwise, and a
    // stale draft written before a field was renamed to something
    // credential-shaped would be poured straight back into a live input.
    if (isSensitiveName(name)) continue;

    const els = byName.get(name);
    if (!els || els.length === 0) continue;

    if (index !== null) {
      const el = els[index]; // a group that shrank simply has no slot here
      if (el) writeControl(el, value);
      continue;
    }
    if (isRadioGroup(els)) {
      for (const el of els) (el as HTMLInputElement).checked = el.value === value;
      continue;
    }
    writeControl(els[0], value);
  }
}

/**
 * The uncontrolled-form adapter: hands `useFormDraft` a way to read and write a
 * form it never has to know the shape of.
 */
export function formPort(
  ref: RefObject<HTMLFormElement | null>,
  exclude: readonly string[] = [],
): { snapshot: () => DraftFields; apply: (fields: DraftFields) => void } {
  return {
    snapshot: () => readFormFields(ref.current, exclude),
    apply: (fields) => writeFormFields(ref.current, fields),
  };
}

/** How the surface treats a draft it finds waiting. */
export type DraftMode =
  /**
   * The text is simply back. A create surface has no server-side truth for a
   * draft to contradict, and a dialog between someone and the words they just
   * lost is a tax with no upside.
   */
  | "restore"
  /**
   * Say it and wait. On an edit surface the saved record is real and something
   * else may have changed it since; a days-old draft applied on sight would
   * silently revert that change.
   */
  | "offer";

export type DraftState =
  | { status: "none" }
  /** Applied on arrival; `at` is when the text was last touched. */
  | { status: "restored"; at: number }
  /** Found and held back, waiting to be taken or thrown away. */
  | { status: "offered"; at: number; fields: DraftFields };

export type DraftHandle = {
  state: DraftState;
  field: <T>(key: string, initial: T) => [T, Dispatch<SetStateAction<T>>];
  restore: () => void;
  discard: () => void;
  clear: () => void;
  onSubmit: () => void;
  recoverAfterFailedSave: () => void;
  onReset: (event: { preventDefault: () => void }) => void;
};

// Long enough that a burst of typing is one write, short enough that a phone
// dying mid-sentence costs a few words rather than a paragraph. The
// visibilitychange/pagehide flush is what actually catches a backgrounded PWA;
// this only bounds the damage from a hard power-off.
const SAVE_DEBOUNCE_MS = 400;

/** Storage throws in Safari private mode, and a keystroke handler cannot care. */
function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota or private mode — the form still works, it just stops remembering */
  }
}
function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* as above */
  }
}

/**
 * Keeps what has been typed into a form, and decides what to do with it on the
 * way back in.
 *
 * Knows nothing about the DOM and nothing about React state. It is handed a
 * `snapshot`/`apply` pair — by `formPort` for an uncontrolled form, by `field()`
 * for a controlled one, or by the caller directly for a hybrid — and everything
 * else is written once, here.
 *
 * The baseline is read from whatever the surface says before any draft is
 * applied, which is why nothing has to be threaded in to describe it: a draft is
 * only a draft if it says something the page did not already say.
 */
export function useFormDraft({
  scope,
  mode,
  snapshot: snapshotOpt,
  apply: applyOpt,
}: {
  scope: string;
  mode: DraftMode;
  snapshot?: () => DraftFields;
  apply?: (fields: DraftFields) => void;
}): DraftHandle {
  const key = draftKey(scope);
  const [draft, setDraft] = useState<DraftState>({ status: "none" });
  const baseline = useRef<DraftFields | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fields registered through `field()` this render, and their setters. Written
  // during render on purpose: `field()` is called from the component body, and
  // the write is idempotent, so StrictMode's double render is harmless.
  const registered = useRef(new Map<string, string>());
  const setters = useRef(new Map<string, (raw: string) => void>());

  // Mirrors `draft.status` for the listeners. They are attached once and hold a
  // stable `save`; reading state through it would resubscribe the input,
  // visibilitychange and pagehide handlers on every status change, and a
  // pagehide handler being swapped out is one that might not fire.
  const draftStatus = useRef<DraftState["status"]>("none");

  // Serialised snapshot as of the last settled render, and a request to treat
  // the next render as the new starting point. Both belong to the post-render
  // change check further down.
  const lastSeen = useRef<string | null>(null);
  const rebaseline = useRef(false);
  // Set once the user types into a surface that has a draft on offer. From then
  // on storage follows the live text; the offer survives in React state.
  const offerSuperseded = useRef(false);

  /**
   * Armed by `recoverAfterFailedSave`, read by `onReset`. See both, and the
   * `onReset` doc for why a one-shot recovery is not enough on its own.
   */
  const preserveOnReset = useRef(false);

  /**
   * The baseline as it stood BEFORE this key's draft was applied, remembered so
   * the mount effect can re-run without re-reading a surface it has already
   * restored into.
   *
   * StrictMode is why this exists, and the bug it fixes is invisible to a
   * production build. React fakes an unmount and re-runs the mount effect on
   * the same component instance — refs and the DOM both survive — so on the
   * second run `snapshot()` would read an UNCONTROLLED form that already holds
   * the restored text. The baseline then equals the draft, `fieldsDiffer` is
   * false, and the effect takes its `safeRemove` branch: the draft is deleted
   * and the notice disappears, in dev only, one reload after it was written.
   * `field()` surfaces never saw it, because `registered.current` still holds
   * the pre-restore values on the second run.
   *
   * Keyed, so a `scope` change still re-reads: it is only ever reused for the
   * same surface. Kept in step with `rebaseline` below, so a cleared or
   * discarded form does not resurrect an obsolete starting point.
   */
  const priorBaseline = useRef<{ key: string; fields: DraftFields } | null>(null);

  // Values are JSON so `field()` can carry numbers, booleans and arrays without
  // the pure module ever seeing anything but strings.
  const field = useCallback(<T,>(k: string, initial: T): [T, Dispatch<SetStateAction<T>>] => {
    /* Called from the component body in a stable order, so the dispatcher is
       active and hook order is preserved; dynamic field sets use explicit ports
       instead. A block disable rather than -next-line on purpose: written as a
       wrapped `eslint-disable-next-line` with its reason on a second line, the
       directive lands on the comment rather than the useState, so it is
       reported unused AND the rule still fires. */
    /* eslint-disable react-hooks/rules-of-hooks */
    const [value, setValue] = useState<T>(initial);
    /* eslint-enable react-hooks/rules-of-hooks */
    registered.current.set(k, JSON.stringify(value));
    setters.current.set(k, (raw) => {
      try {
        setValue(JSON.parse(raw) as T);
      } catch {
        /* a draft written by an older shape — leave the field as it is */
      }
    });
    return [value, setValue];
  }, []);

  // The ports are held in refs and read through them, so `snapshot` and `apply`
  // — and therefore `save` — are referentially stable for the life of the
  // surface. This is load-bearing, not tidiness. Every call site passes either a
  // fresh `...formPort(ref)` object or inline arrows, so depending on them
  // directly would give `save` a new identity on every render, which would
  // resubscribe the input, visibilitychange and pagehide listeners on every
  // render — and a pagehide handler being swapped out is one that might not fire,
  // on precisely the event this whole module exists to survive.
  const snapshotOptRef = useRef(snapshotOpt);
  const applyOptRef = useRef(applyOpt);
  // Latched in a LAYOUT effect rather than in the render body. A ref written
  // during render is what `react-hooks/refs` forbids, and nothing here needs it
  // written that early: `useRef`'s initial value already covers the first
  // render, and every later reader is commit-phase or event-time - `save` from
  // the document input/visibilitychange/pagehide listeners, `snapshot` from the
  // post-render change check, `apply` from the mount effect. Layout effects run
  // synchronously during the commit and in source order, and this one is
  // declared above all of those, so it is always current before any of them
  // looks. No dependency array on purpose: it must re-latch on every commit,
  // exactly as the assignment did on every render.
  useLayoutEffect(() => {
    snapshotOptRef.current = snapshotOpt;
    applyOptRef.current = applyOpt;
  });

  const snapshot = useCallback((): DraftFields => {
    return { ...Object.fromEntries(registered.current), ...(snapshotOptRef.current?.() ?? {}) };
  }, []);

  const apply = useCallback((fields: DraftFields) => {
    applyOptRef.current?.(fields);
    for (const [k, raw] of Object.entries(fields)) setters.current.get(k)?.(raw);
  }, []);

  /**
   * Has the form moved off its baseline while a draft was on offer?
   *
   * Latches: once the offer is superseded it stays superseded until one of the
   * three exits resets it, so typing something and then retyping the original
   * does not put storage back to sleep with a half-finished edit on screen.
   *
   * Called from BOTH change paths, and it has to be, because neither one sees
   * the other's case. Uncontrolled typing changes the DOM without re-rendering,
   * so the post-render check never runs — `save`, reached straight from the
   * document `input` listener, is the only thing that observes it. A controlled
   * value changed by a button re-renders without any DOM input event, so the
   * listener never fires and only the post-render check observes it. Putting
   * the latch in one of the two would fix the bug for half the fleet.
   *
   * Read the name precisely: superseded means THE FIELDS DIFFER FROM THE
   * BASELINE, not "the user typed". A programmatic re-seed trips it with no
   * keystroke — `IncomeSourceRow.startEdit` re-seeds all five fields from the
   * record on every entry, so type -> Cancel -> Edit supersedes, and then the
   * re-seeded fields match the baseline again so `save` takes its
   * `!fieldsDiffer -> safeRemove` branch and the unanswered offer is erased from
   * storage. Typing one character and deleting it does the same.
   *
   * That is deliberate and not a bug to undo. Storage either tracks the live
   * form or it holds still; there is no coherent third state, and "hold still
   * unless the text happens to differ" is the one that lets `restore` apply
   * older text over newer. The offer survives in React state, so the notice and
   * `restore` keep working for the rest of the session — it is a reload that
   * loses it.
   */
  const supersedeIfEdited = useCallback((fields: DraftFields): boolean => {
    if (offerSuperseded.current) return true;
    if (baseline.current && fieldsDiffer(fields, baseline.current)) {
      offerSuperseded.current = true;
    }
    return offerSuperseded.current;
  }, []);

  const save = useCallback(() => {
    if (baseline.current === null) return;

    // An offered draft is held back from the fields on purpose, so the form
    // matching its own defaults is the NORMAL state here, not a signal that
    // there is nothing to keep. Writing or clearing on that basis would destroy
    // the draft outright: opening an edit surface and backgrounding the app
    // without touching anything would fire the visibility flush, find no
    // difference, and delete the very words the notice was offering to put back.
    //
    // But ONLY until the user types. An unanswered offer must not block new
    // drafting: otherwise someone opens an edit surface, ignores the notice,
    // retypes the field, backgrounds the app — and the new text is never written
    // anywhere, while they are offered the old draft again on return. That is
    // the exact scenario this module exists to prevent, arriving through the
    // guard meant to protect it. Once `offerSuperseded` is set, the offer lives
    // on in React state (so `restore` still works from memory) and storage
    // follows the live text, which is the more recent of the two.
    //
    // Note what this deliberately does NOT do: skip only the `safeRemove`
    // branch below while offered. That would leave `draft.fields` in React
    // state staler than storage, and `restore` would then apply the older text
    // over the newer. Either storage tracks the live form or it holds still;
    // there is no coherent third state.
    const fields = snapshot();
    if (draftStatus.current === "offered" && !supersedeIfEdited(fields)) return;

    // Back to what the page shipped with — including a restored draft then
    // emptied by hand. There is nothing left to keep.
    if (!fieldsDiffer(fields, baseline.current)) {
      safeRemove(key);
      return;
    }
    const raw = serializeDraft(fields, Date.now());
    if (raw) safeWrite(key, raw);
  }, [key, snapshot, supersedeIfEdited]);

  // Throwing the draft away has to undo the restore as well, or the word is a
  // lie: in restore mode the text is already back in the fields by the time this
  // is reachable, and clearing only the stored copy would take the notice away
  // and leave the words sitting there. Put the surface back to what it shipped
  // with — which for an offered draft it never left.
  const discard = useCallback(() => {
    // FIRST, exactly as in `clear`, and for the same reason: a debounce armed by
    // the last keystroke is still pending here, and a `save` that lands in the
    // ~400ms after a discard writes the just-discarded text straight back into
    // storage. The discard then reads as a no-op one reload later.
    if (timer.current) clearTimeout(timer.current);
    if (baseline.current && draftStatus.current === "restored") apply(baseline.current);
    safeRemove(key);
    offerSuperseded.current = false;
    preserveOnReset.current = false;
    // Same reason as `clear`, one step milder: the fields are back at the
    // baseline, so re-recording is a no-op on the values but is what stops the
    // post-render check from reading the restore-then-revert as a fresh edit.
    rebaseline.current = true;
    draftStatus.current = "none";
    setDraft({ status: "none" });
  }, [apply, key]);

  const restore = useCallback(() => {
    if (draft.status !== "offered") return;
    apply(restorableFields(draft.fields, Object.keys(snapshot())));
    offerSuperseded.current = false;
    preserveOnReset.current = false;
    draftStatus.current = "restored";
    setDraft({ status: "restored", at: draft.at });
  }, [apply, draft, snapshot]);

  /**
   * Drops the draft. Called by the form on a CONFIRMED successful save, and by
   * a surface whose close is itself a deliberate discard (the feedback modal).
   *
   * This replaces idreamofneon's "unmounted while submitting and nothing
   * reported failure means success" inference, which is correct there because
   * its actions end in `redirect()`. Almost nothing else in the fleet does — the
   * common shape is a server action called inside `startTransition` with the
   * component staying mounted — so success has to be told, not deduced.
   */
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    safeRemove(key);
    // What is on screen has just become the saved truth, so it is the new
    // baseline. Without this the post-render check below would find the fields
    // still differing from the ORIGINAL baseline on the very next render and
    // write the draft straight back — so submitting successfully and staying on
    // the page would resurrect the draft it just cleared.
    rebaseline.current = true;
    offerSuperseded.current = false;
    // The save took, so the form emptying itself is the point rather than the
    // damage: whatever reset follows must go through.
    preserveOnReset.current = false;
    draftStatus.current = "none";
    setDraft({ status: "none" });
  }, [key]);

  // Layout effect, not effect: in restore mode this writes the text back before
  // paint, which is the difference between "it was never gone" and a visible
  // flash of the empty form it was just lost from.
  useLayoutEffect(() => {
    // Re-snapshot only for a surface this hook has not already read. See
    // `priorBaseline` — on StrictMode's second run the form may already hold
    // the restored text, and reading it back as the baseline destroys the draft.
    if (priorBaseline.current?.key === key) {
      baseline.current = priorBaseline.current.fields;
    } else {
      baseline.current = snapshot();
      priorBaseline.current = { key, fields: baseline.current };
    }

    // A surface whose `scope` changes WITHOUT a remount — a route param moving
    // from one record to the next — must not keep the previous record's notice
    // on screen. Three of the paths below leave without offering anything (no
    // stored draft; a draft that has caught up with the page; a restore-mode
    // draft with nothing usable left in it), and none of them used to touch the
    // state, so a stale offer stayed rendered AND restorable: one tap from
    // pouring one record's text into another record's form. Reset first, then
    // let this scope say what it has to say.
    //
    // Guarded rather than unconditional so the overwhelmingly common case — a
    // first mount with no draft anywhere — does not schedule a pointless
    // re-render on every drafting surface in the fleet.
    if (draftStatus.current !== "none") {
      offerSuperseded.current = false;
      draftStatus.current = "none";
      setDraft({ status: "none" });
    }

    const stored = readStoredDraft(key);
    if (!stored) return;

    // A draft that has caught up with what the page now shows is noise.
    if (!fieldsDiffer(stored.fields, baseline.current)) {
      safeRemove(key);
      return;
    }

    // set-state-in-effect is disabled across both branches: this is not derived
    // from anything React can see. It is a one-shot read of localStorage, which
    // does not exist on the server and so cannot be touched during render
    // without a hydration mismatch, followed by a write into a surface that has
    // to be mounted first. It fires once per mount and settles.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (mode === "restore") {
      const usable = restorableFields(stored.fields, Object.keys(baseline.current));
      if (!fieldsDiffer({ ...baseline.current, ...usable }, baseline.current)) return;
      apply(usable);
      draftStatus.current = "restored";
      setDraft({ status: "restored", at: stored.at });
    } else {
      // Beyond the three exits (`restore`, `discard`, `clear`) that reset this:
      // a NEW offer must start unsuperseded. This effect re-runs without a
      // remount whenever `scope` changes — a route param moving from one record
      // to another — and a flag left true from the previous surface would let
      // the very first flush overwrite a draft nobody has been shown yet.
      offerSuperseded.current = false;
      draftStatus.current = "offered";
      setDraft({ status: "offered", at: stored.at, fields: stored.fields });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // Deliberately keyed on the surface's identity alone. Re-running this on
    // every `snapshot`/`apply` identity change would re-apply the draft over
    // live typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode]);

  // An edit draft for a record never opened again is never read, so it is never
  // the read path that clears it. Sweep this origin's own aged keys once.
  useEffect(() => {
    try {
      const keys = Object.keys(window.localStorage);
      for (const stale of expiredKeys(keys, safeRead, Date.now())) safeRemove(stale);
    } catch {
      /* private mode */
    }
  }, []);

  // Debounced while typing; flushed the moment the page is backgrounded or
  // hidden, which on iOS is the last callback before the tab can be evicted.
  // Deliberately not `beforeunload` — it is unreliable on iOS and firing it can
  // cost the page its bfcache entry.
  //
  // The listener is on `document`, not on a form element, so it catches
  // controlled surfaces that have no <form> at all — which is most of the
  // fleet's highest-value ones.
  useEffect(() => {
    const onInput = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
    };
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      save();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [save]);

  // Controlled state that changes WITHOUT a DOM input event — a button-group
  // toggle, a rating picker, a swatch, a chip added by click, anything an
  // explicit `apply` port drives — never fires `input` or `change`, so the
  // listener above cannot see it. DESIGN.md makes that the COMMON case here
  // rather than the exception: the fleet's answer to a checkbox is a <button>
  // toggle, and savor's rating pickers, space's kind/colour groups, giftme's
  // tone chips and nexus's MBTI and colour pickers are all button-driven.
  //
  // Comparing the snapshot after every render is what catches them. Uncontrolled
  // typing is the mirror case — it changes the DOM without re-rendering at all —
  // which is why both mechanisms exist and neither is redundant.
  useEffect(() => {
    if (baseline.current === null) return;

    // A rebaseline is requested by `clear` (what is on screen just became the
    // saved truth) and by `discard` (the fields are back where they started).
    //
    // Checked BEFORE the `offered` early return below, which is safe only
    // because both callers set `draftStatus.current = "none"` in the same
    // synchronous call that sets this flag. That pairing is an invariant, not
    // something the code enforces: a future caller that requests a rebaseline
    // while a draft is still `offered` would overwrite the baseline with the
    // unmodified form and destroy the draft the notice is offering. Keep the
    // two assignments together.
    if (rebaseline.current) {
      rebaseline.current = false;
      baseline.current = snapshot();
      // In step with the baseline itself: what is on screen has just become the
      // starting point, so a later re-run of the mount effect on this same key
      // must not reach back past it.
      priorBaseline.current = { key, fields: baseline.current };
      lastSeen.current = JSON.stringify(baseline.current);
      return;
    }

    const fields = snapshot();
    const current = JSON.stringify(fields);

    // An unanswered offer holds storage still — but only until the user touches
    // the form. The first real edit supersedes the offer: the offered text stays
    // in React state where `restore` can still reach it, and storage starts
    // following what is being changed now. Without this, every edit surface in
    // the fleet silently stops saving the moment a draft is on offer.
    if (draftStatus.current === "offered" && !supersedeIfEdited(fields)) {
      // Recorded even though nothing is being saved. Without this the render
      // that eventually flips the latch lands in the `lastSeen === null` branch
      // below, which records and returns — so the FIRST superseding change
      // schedules nothing and only the second one persists. A change carrying a
      // DOM event hides that, because the `input` listener schedules on its own;
      // a <button> toggle does not, and a button toggle is the fleet's answer to
      // a checkbox and the exact case this post-render path exists for.
      lastSeen.current = current;
      return;
    }

    if (lastSeen.current === null) {
      lastSeen.current = current; // first settled render — record, do not save
      return;
    }
    if (current === lastSeen.current) return;
    lastSeen.current = current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
    // No dependency array on purpose: this must run after EVERY render, because
    // any render is where a non-DOM state change becomes visible.
  });

  /** Flush before an attempt, so a save that dies mid-flight leaves a copy behind. */
  const onSubmit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    // A fresh attempt: the previous refusal's guard must not outlive it, or a
    // successful retry's own reset would be cancelled and the sent text would
    // sit in the box looking unsent.
    preserveOnReset.current = false;
    save();
  }, [save]);

  /**
   * Puts the words back after a save that did not take.
   *
   * React 19 **resets the form** once a form action completes, uncontrolled
   * fields and all, which is fine when the action redirects and fatal when it
   * comes back with an error: the fields blank, and re-reading them to refresh
   * the draft would write that blankness over the only surviving copy. The
   * recovery is one-directional. Read the draft `onSubmit` flushed before the
   * attempt, write it back, and never the other way round.
   *
   * Call it from a **layout** effect. React performs that reset in the MUTATION
   * phase of the commit that delivers the failed state, so a layout effect is
   * the first place that runs after it — within the same commit, before paint.
   * A passive `useEffect` also runs after the reset, but in a LATER task: the
   * box is blank for a paint, and a test that asserts as soon as the error text
   * appears reads the blank one perhaps one run in sixteen.
   *
   * Only `useActionState` forms need this. Controlled forms never blank.
   */
  const recoverAfterFailedSave = useCallback(() => {
    const stored = readStoredDraft(key);
    if (!stored) return;
    apply(restorableFields(stored.fields, Object.keys(snapshot())));
    preserveOnReset.current = true;
  }, [apply, key, snapshot]);

  /**
   * Holds the line for a reset that arrives AFTER the recovery above.
   *
   * React's post-action form reset and the effect that reacts to the refusal are
   * two different consequences of one resolved promise, and nothing orders them:
   * the reset is a mutation applied in a commit, the recovery is a passive
   * effect, and which commit the reset lands in depends on how the action's
   * promise settles. Land it first and the box blanks and `recoverAfterFailedSave`
   * fills it back in. Land it second and the recovery ran against a form that
   * was still full — a no-op — and then the reset takes the words away with the
   * error message still on screen asking for another try. Same code, same test,
   * one run in sixteen.
   *
   * So the recovery is made order-independent instead of merely early: once a
   * refusal has been recovered from, the form's own reset is cancelled until the
   * next submit, restore, discard or clear. `reset` is cancelable exactly so a
   * form can refuse to throw away what is in it, and preventing it is cheaper
   * and steadier than racing to refill afterwards. Wire it up as the form's
   * `onReset`; surfaces without a `useActionState` form never arm it and can
   * ignore it.
   */
  const onReset = useCallback((event: { preventDefault: () => void }) => {
    if (preserveOnReset.current) event.preventDefault();
  }, []);

  return { state: draft, field, restore, discard, clear, onSubmit, recoverAfterFailedSave, onReset };
}

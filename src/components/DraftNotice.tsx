
import { useEffect, useState } from "react";
import type { DraftState } from "./useFormDraft";
import "./DraftNotice.css";

// Computed at render, so server and client can land either side of a minute
// boundary — hence suppressHydrationWarning on the <time>, whose dateTime
// carries the machine-readable value. Only ever counts up from a past moment.
//
// FLOOR, not round, at every tier. Rounding compares the ROUNDED value against
// the bucket bound, so the upper half of a unit is promoted before that unit has
// elapsed and a whole bucket is skipped: at 3599s, `Math.round(3599/60)` is 60,
// which fails `mins < 60`, and the label jumps to "1 hr ago" a second early
// having never once said "59 min ago". The hours-to-days boundary does the same
// thing up to half an hour early.
function ago(ms: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (secs < 60) return "moments ago";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} d ago`;
}

/** How long an armed discard stays armed before returning to rest. */
const ARM_MS = 4000;

/**
 * How long the armed control ignores a confirming press.
 *
 * Without this the two-tap contract is satisfiable by ONE gesture. A double
 * click delivers two `click` events milliseconds apart; worse, holding Enter on
 * a focused button makes the OS repeat the keydown, and each repeat fires
 * another `click` — so a single held key arms the control and then confirms it,
 * destroying the draft with no second decision anywhere. 350ms is beneath
 * noticing for someone deliberately pressing twice and well above both.
 */
const ARM_MIN_MS = 350;

export default function DraftNotice({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: DraftState;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  // Discard is destructive and unconfirmed would be wrong here. In "restore"
  // mode the text is ALREADY back in the fields by the time this is on screen,
  // and discarding wipes those visible fields back to the baseline. A single
  // stray tap blanking work someone just got back is self-defeating in a feature
  // whose whole purpose is not losing typed work — and DESIGN.md's rule
  // ("destructive actions confirm; cheap ones undo instead") rules out doing
  // neither. A modal is far heavier than this quiet strip warrants, so the
  // control arms itself instead: first tap asks, second tap does it.
  // The timestamp the control was armed at, not a boolean — the cooldown below
  // needs to know when, not just whether.
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const armed = armedAt !== null;

  const restored = draft.status === "restored";
  const present = draft.status !== "none";
  const draftAt = present ? draft.at : null;

  // Disarm on its own, so a stray tap does not leave a loaded control sitting
  // there indefinitely.
  useEffect(() => {
    if (armedAt === null) return;
    const timer = setTimeout(() => setArmedAt(null), ARM_MS);
    return () => clearTimeout(timer);
  }, [armedAt]);

  // Re-disarm whenever the notice changes what it is talking about.
  //
  // Keyed on `at` as well as `status`, and the `at` half is the load-bearing
  // one. `useFormDraft`'s mount effect can move straight from one surface's
  // offered draft to another's — a route whose param changed without the
  // component remounting — leaving `status` at "offered" across two DIFFERENT
  // drafts. Keyed on status alone the control stays armed through that, and the
  // next tap destroys a draft the user never saw.
  //
  // Done DURING RENDER against a mirror of the identity it last disarmed for,
  // not in an effect: an effect disarms only after the new notice has already
  // been painted with the control still armed, which is the exact frame this
  // guard exists to remove.
  const noticeIdentity = `${draft.status}:${draftAt ?? ""}`;
  const [armedFor, setArmedFor] = useState(noticeIdentity);
  if (armedFor !== noticeIdentity) {
    setArmedFor(noticeIdentity);
    setArmedAt(null);
  }

  function handleDiscardPress() {
    if (armedAt === null) {
      setArmedAt(Date.now());
      return;
    }
    // Too fast to be a second decision — see ARM_MIN_MS. The control stays
    // armed, so a real second press still works.
    if (Date.now() - armedAt < ARM_MIN_MS) return;
    onDiscard();
  }

  return (
    // The live region is rendered UNCONDITIONALLY and only its CONTENTS change.
    //
    // That is the whole point and it is easy to undo by accident. In "restore"
    // mode the text comes back without being asked, so this announcement is the
    // entire accessibility contract — nothing else tells a screen-reader user it
    // happened. A live region reliably announces changes WITHIN a node the
    // assistive tech already knows about; inserting a brand-new subtree that
    // already contains its text is the pattern several AT/browser pairs miss,
    // Safari with VoiceOver among them. Returning null from the component would
    // do exactly that. An empty div costs nothing and has no box.
    // The class is not decoration: see `.draft-notice-region` in globals.css.
    // "An empty div has no box" holds in NORMAL FLOW and nowhere else — in a
    // gapped flex or grid parent this becomes an item, takes a line, and adds a
    // gap of dead space whether or not there is a draft.
    <div className="draft-notice-region" role="status" aria-live="polite">
      {present ? (
        <div className="draft-notice">
          <p className="draft-notice-text">
            {restored ? "Kept what you had written" : "Unsaved changes"}
            {" · "}
            <time dateTime={new Date(draft.at).toISOString()} suppressHydrationWarning>
              {ago(draft.at)}
            </time>
          </p>

          {draft.status === "offered" ? (
            <button
              type="button"
              className="draft-notice-action draft-notice-restore"
              onClick={onRestore}
            >
              restore
            </button>
          ) : null}

          {/* No aria-label: the visible text IS the accessible name, which is
              what voice control needs to match on. */}
          <button
            type="button"
            className={`draft-notice-action draft-notice-discard${armed ? " is-armed" : ""}`}
            onClick={handleDiscardPress}
          >
            {armed ? "tap again to discard" : "discard"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// What a half-written form is worth deciding, away from the DOM and away from
// React. Everything here is pure so the rules can be tested without a browser;
// the storage, the form and the state live in the hook that calls this.
//
// Generalised from idreamofneon's lib/compose-draft.ts, which solved the same
// problem for one compose surface. Two rules are deliberately different here and
// both are noted at the point they apply: hidden inputs are kept rather than
// skipped, and credential-shaped fields are never stored at all.

/** Bumped only when the stored shape changes. An older draft is dropped, not migrated. */
export const DRAFT_SCHEMA = 1;

/** localStorage is a few MB and shared with the whole origin. A form is a few KB. */
export const MAX_DRAFT_BYTES = 256_000;

/** An abandoned edit draft is never read again, so it needs its own way out. */
export const MAX_DRAFT_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The one line that differs between apps' copies of this file. It keeps the
 * origin-wide expiry sweep from touching anything that is not ours.
 */
export const DRAFT_KEY_PREFIX = "pause:draft:";

export type DraftFields = Record<string, string>;

export type StoredDraft = {
  v: number;
  /** ms since epoch, when the text was last touched. */
  at: number;
  fields: DraftFields;
};

/**
 * One key per surface. `<entity>:new` is a single shared draft — there is only
 * ever one unsaved new record of a kind — while each record being edited gets
 * its own, so editing two in two tabs cannot cross the streams.
 */
export function draftKey(scope: string): string {
  return `${DRAFT_KEY_PREFIX}${scope}`;
}

/**
 * Fields that must never reach localStorage, however they are typed.
 *
 * idreamofneon's version has no equivalent because a dream journal never has a
 * credential on screen. The fleet does — tide has a SimpleFIN setup token and an
 * API key block, vitals has portal credentials — and a per-form promise to
 * remember to exclude them is exactly the kind of promise that gets forgotten
 * when the eleventh form is written. So it is structural.
 */
// Matched per NAME SEGMENT, in three tiers, because a flat substring test is
// wrong in both directions and both directions cost something real. A missed
// credential goes to localStorage in plaintext. A false positive silently drops
// ordinary content from every draft in ten apps — which is the very failure this
// module exists to prevent, arriving through the guard meant to prevent it.
//
// The tiers exist because English is in the way. `password`, `token`, `ssn` and
// friends are unambiguous wherever they appear. `secret` and `pass` are ordinary
// words: `secretSanta` is a plausible giftme field, `boardingPass` a plausible
// passage one, `secretIngredient` a plausible savor one — while `clientSecret`
// is unmistakably a credential. Position carries that distinction.

/** Sensitive wherever they appear as a whole segment. */
const SENSITIVE_ANYWHERE = new Set([
  "password",
  "passwd",
  "passcode",
  "passphrase",
  "token",
  "credential",
  "credentials",
  "otp",
  "cvv",
  "cvc",
  "ssn",
]);

/** Sensitive only as the FINAL segment: `clientSecret` yes, `secretSanta` no. */
const SENSITIVE_AS_SUFFIX = new Set(["secret"]);

/**
 * Sensitive only as the ENTIRE name: a field called `pass`, `key` or `pin`,
 * alone. `pin` cannot go in any broader tier — nexus has a real `dreamPin`
 * field, and flagging it would strip it from every draft — so a card PIN is
 * caught by name in SENSITIVE_JOINED instead.
 */
const SENSITIVE_ALONE = new Set(["pass", "key", "auth", "secret", "pin"]);

/**
 * Credentials that only read as one once the segments are rejoined, plus the
 * spelled-out forms of abbreviations already covered above. `ssn` alone does
 * not catch `socialSecurityNumber`, and no tier catches `cardPin` without also
 * catching `dreamPin`; both are named here explicitly.
 */
const SENSITIVE_JOINED = [
  "apikey",
  "apitoken",
  "accesstoken",
  "refreshtoken",
  "bearertoken",
  "authtoken",
  "secretkey",
  "privatekey",
  "sharedsecret",
  "socialsecurity",
  "cardpin",
  "debitpin",
  "atmpin",
  "pincode",
  "securitycode",
];

/**
 * `userPassword` -> ["user","password"]; `api_key` -> ["api","key"];
 * `APIToken` -> ["api","token"].
 *
 * The first replace is the acronym rule and it is not optional: without it an
 * uppercase run never separates from the word after it, so `APIToken` collapses
 * to one segment `"apitoken"`, matches nothing, and a credential is kept.
 * `SSNNumber` and `OTPCode` fail the same way.
 */
function nameSegments(name: string): string[] {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

export function isSensitiveName(name: string): boolean {
  const segs = nameSegments(name);
  if (segs.length === 0) return false;
  if (segs.some((s) => SENSITIVE_ANYWHERE.has(s))) return true;
  if (segs.length === 1 && SENSITIVE_ALONE.has(segs[0])) return true;
  if (segs.length > 1 && SENSITIVE_AS_SUFFIX.has(segs[segs.length - 1])) return true;
  const flat = segs.join("");
  return SENSITIVE_JOINED.some((c) => flat.includes(c));
}

export function stripSensitive(fields: DraftFields): DraftFields {
  const out: DraftFields = {};
  for (const [name, value] of Object.entries(fields)) {
    if (!isSensitiveName(name)) out[name] = value;
  }
  return out;
}

/** True once `at` is old enough that keeping it is hoarding rather than helping. */
export function isExpired(draft: StoredDraft, now: number): boolean {
  return now - draft.at > MAX_DRAFT_AGE_MS;
}

/**
 * Which of this origin's draft keys have aged out. Given every localStorage key
 * and a reader for each, so the sweep itself stays testable.
 */
export function expiredKeys(
  keys: readonly string[],
  read: (key: string) => string | null,
  now: number,
): string[] {
  return keys.filter((key) => {
    if (!key.startsWith(DRAFT_KEY_PREFIX)) return false;
    const draft = parseDraft(read(key));
    // Unparseable is not "keep it" — it is a key we can never act on again.
    return draft === null || isExpired(draft, now);
  });
}

/**
 * Returns null rather than throwing when there is nothing worth keeping or the
 * text is implausibly large, because every caller is a keystroke handler and
 * none of them can do anything useful with an exception.
 */
export function serializeDraft(fields: DraftFields, at: number): string | null {
  const safe = stripSensitive(fields);
  if (Object.keys(safe).length === 0) return null;
  const raw = JSON.stringify({ v: DRAFT_SCHEMA, at, fields: safe } satisfies StoredDraft);
  // `.length` is UTF-16 units, which is what the localStorage quota counts in.
  if (raw.length > MAX_DRAFT_BYTES) return null;
  return raw;
}

/** Anything not recognisably a current-schema draft reads as no draft at all. */
export function parseDraft(raw: string | null | undefined): StoredDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { v, at, fields } = parsed as Partial<StoredDraft>;
  if (v !== DRAFT_SCHEMA) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return null;
  const clean: DraftFields = {};
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === "string" && !isSensitiveName(name)) clean[name] = value;
  }
  return { v, at, fields: clean };
}

/**
 * Whether these fields say anything the form did not already say on its own.
 *
 * The baseline is the form's own defaults — empty on a create surface, the saved
 * record on an edit one. Comparing against it is what stops "she opened the page
 * and typed nothing" from being announced as a recovered draft, and what lets a
 * draft that has caught up with the server be quietly thrown away instead of
 * offered.
 */
export function fieldsDiffer(fields: DraftFields, baseline: DraftFields): boolean {
  const names = new Set([...Object.keys(fields), ...Object.keys(baseline)]);
  for (const name of names) {
    if ((fields[name] ?? "") !== (baseline[name] ?? "")) return true;
  }
  return false;
}

/**
 * The subset of a draft that still has somewhere to go. A form's field set can
 * change between writing the draft and coming back to it — a repeating group
 * gains or loses a row, a conditional section closes — and restoring blind would
 * either write into the wrong row or invent fields nothing reads.
 */
export function restorableFields(
  fields: DraftFields,
  presentNames: Iterable<string>,
): DraftFields {
  const present = new Set(presentNames);
  const out: DraftFields = {};
  for (const [name, value] of Object.entries(fields)) {
    if (present.has(name)) out[name] = value;
  }
  return out;
}

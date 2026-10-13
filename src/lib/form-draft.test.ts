import { describe, it, expect } from "vitest";
import {
  DRAFT_KEY_PREFIX,
  MAX_DRAFT_AGE_MS,
  draftKey,
  expiredKeys,
  fieldsDiffer,
  isSensitiveName,
  parseDraft,
  restorableFields,
  serializeDraft,
  stripSensitive,
} from "./form-draft";

describe("draftKey", () => {
  it("namespaces the scope under the app prefix", () => {
    expect(draftKey("fund:12")).toBe(`${DRAFT_KEY_PREFIX}fund:12`);
  });
});

describe("serializeDraft / parseDraft", () => {
  it("round-trips fields and the timestamp", () => {
    const raw = serializeDraft({ name: "Roof" }, 1000);
    expect(parseDraft(raw)).toEqual({ v: 1, at: 1000, fields: { name: "Roof" } });
  });

  it("returns null for an empty field set rather than storing noise", () => {
    expect(serializeDraft({}, 1000)).toBeNull();
  });

  it("returns null rather than throwing when the text is implausibly large", () => {
    expect(serializeDraft({ body: "x".repeat(300_000) }, 1000)).toBeNull();
  });

  it("reads unparseable, wrong-schema and non-object data as no draft", () => {
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 99, at: 1, fields: {} }))).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1, at: "soon", fields: {} }))).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1, at: 1, fields: [] }))).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });

  it("drops non-string field values instead of trusting them", () => {
    const raw = JSON.stringify({ v: 1, at: 1, fields: { a: "keep", b: 7 } });
    expect(parseDraft(raw)?.fields).toEqual({ a: "keep" });
  });
});

describe("fieldsDiffer", () => {
  it("is false when the fields say what the page already said", () => {
    expect(fieldsDiffer({ a: "1" }, { a: "1" })).toBe(false);
  });

  it("treats a missing key and an empty string as the same thing", () => {
    expect(fieldsDiffer({ a: "1", b: "" }, { a: "1" })).toBe(false);
  });

  it("is true when any value differs", () => {
    expect(fieldsDiffer({ a: "2" }, { a: "1" })).toBe(true);
  });
});

describe("restorableFields", () => {
  it("keeps only fields the form still has somewhere to put", () => {
    expect(restorableFields({ a: "1", gone: "2" }, ["a"])).toEqual({ a: "1" });
  });
});

describe("isSensitiveName / stripSensitive", () => {
  it("recognises credential-shaped names", () => {
    for (const n of ["password", "userPassword", "apiKey", "api_key", "setupToken", "secret", "cvv", "ssn", "otp", "credential", "clientSecret", "pass", "auth", "socialSecurityNumber", "cardPin", "pinCode", "securityCode", "pin"]) {
      expect(isSensitiveName(n)).toBe(true);
    }
  });

  it("recognises acronym-prefixed credentials, which need the uppercase-run split", () => {
    // Without the acronym rule in nameSegments each of these collapses to a
    // single unmatched segment and the credential is written to localStorage.
    for (const n of ["APIToken", "APIKey", "SSNNumber", "OTPCode"]) {
      expect(isSensitiveName(n)).toBe(true);
    }
  });

  it("does not flag ordinary names that merely contain a sensitive substring", () => {
    // Matched by the obvious substring implementation and must not be matched
    // here: "passengers" contains pass, "adopted" contains otp, "dreamPin" is a
    // real nexus field, "assignee" contains ssn.
    for (const n of ["name", "note", "passengers", "adopted", "dreamPin", "assignee", "keywords", "tokenize"]) {
      expect(isSensitiveName(n)).toBe(false);
    }
  });

  it("does not flag ordinary compound nouns built from an ambiguous word", () => {
    // Every one of these is a plausible real field in this fleet: secretSanta
    // and secretIngredient in giftme and savor, boardingPass and eventPass in
    // passage. Flagging them would silently drop the field from every draft.
    for (const n of ["secretSanta", "secretIngredient", "boardingPass", "eventPass", "parkingPass", "keyMoments", "dreamPin", "pinnedNote", "securityQuestion"]) {
      expect(isSensitiveName(n)).toBe(false);
    }
  });

  it("removes sensitive entries and keeps the rest", () => {
    expect(stripSensitive({ name: "Roof", apiKey: "sk-1" })).toEqual({ name: "Roof" });
  });
});

describe("expiredKeys", () => {
  const now = 1_000_000_000_000;

  it("returns aged keys, unparseable keys, and ignores foreign keys", () => {
    const store: Record<string, string> = {
      [`${DRAFT_KEY_PREFIX}old`]: serializeDraft({ a: "1" }, now - MAX_DRAFT_AGE_MS - 1)!,
      [`${DRAFT_KEY_PREFIX}fresh`]: serializeDraft({ a: "1" }, now)!,
      [`${DRAFT_KEY_PREFIX}broken`]: "{{{",
      "unrelated:thing": "whatever",
    };
    expect(expiredKeys(Object.keys(store), (k) => store[k] ?? null, now).sort()).toEqual(
      [`${DRAFT_KEY_PREFIX}broken`, `${DRAFT_KEY_PREFIX}old`].sort(),
    );
  });
});

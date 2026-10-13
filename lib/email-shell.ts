// -----------------------------------------------------------------------
// Reference implementation — the branded email shell.
//
// This file is copied verbatim into every app in the fleet; only the
// `EMAIL_THEME` object below (and, unavoidably, the per-app fallback baked
// into the `APP_URL` constant right below this banner) changes per app.
// Everything else — the type, the render functions, the dark-mode
// generator — is meant to be identical across all twelve apps, so treat
// any edit here as an edit to all twelve.
//
// One structural difference from the tide original this file was copied
// from: tide has a central `lib/email.ts` that both re-exports `escapeHtml`
// AND consumes this shell, forming a deliberate two-way module cycle (see
// tide's own copy of this file for the full writeup of why importing
// `escapeHtml` back across that cycle is safe while importing `APP_URL`
// back across it would not be). pause has no equivalent central email
// module — its send sites are `lib/feedback-email.ts` and
// `lib/invite-email.ts`, two independent files, neither of which this file
// should depend on. So `escapeHtml` is declared HERE instead of imported,
// and `feedback-email.ts`/`invite-email.ts` import it FROM this file. That
// sidesteps the cycle question entirely rather than answering it
// differently: there is no cycle to reason about.
//
// The mechanics below are lifted from tide's `buildDailyDigestEmail` and
// the comment block above it in `lib/email.ts` (the "Daily summary email"
// section) — that function already solved the hard email-client problems
// this shell depends on:
//   - literal hex only, no CSS custom properties (Gmail resolves neither
//     `var()` nor `oklch()`/`color-mix()`);
//   - every element carries its LIGHT value inline, because Gmail ignores
//     `prefers-color-scheme` entirely and would otherwise render unstyled;
//   - a class per element that a generated `<style>` block overrides with
//     `!important`, for the clients that DO honour the media query (Apple
//     Mail, and others).
// -----------------------------------------------------------------------

const APP_URL = process.env.APP_URL || 'https://pause.crystalprism.io';

/** Escapes the five HTML-significant characters. Shared by this shell and
 *  every builder that renders caller-supplied text into markup — see the
 *  file banner above for why this lives here instead of being imported
 *  from a central email module pause doesn't have. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dark-mode counterparts of the light tokens below. Optional at the
 * `EmailTheme` level (see `EmailTheme`) — tide is the only app in the fleet
 * that ships a second scheme today; most apps are light-only, two
 * (vantage, idreamofneon) are dark-only, and this shape lets those apps
 * omit `dark` entirely rather than fake a scheme they don't have.
 *
 * `surface` is optional here too: it's a distinct card/surface token, which
 * not every app's DESIGN.md defines (tide doesn't). Add it only when the
 * app has a real token for it.
 */
type EmailThemeDark = {
  ground: string;
  ink: string;
  ink2: string;
  ink3: string;
  hairline: string;
  accent: string;
  surface?: string;
  /** Overrides `accent` as the CTA button's background, dark scheme. See
   *  `EmailThemeBase.ctaAccent` for why this exists at all. Defaults to
   *  `accent` (this scheme's, not the light scheme's) when omitted. */
  ctaAccent?: string;
};

type EmailThemeBase = {
  /** Display name, used in the header wordmark and email subjects elsewhere. */
  name: string;
  /** Canonical app URL, no trailing slash. Also the footer link target. */
  url: string;
  /** Absolute URL to a small (192px) icon. Never the 512 — see below. */
  iconUrl: string;
  /** Serif/display stack for the HEADING (`h1`/`h2`/`h3`-equivalent `<p>`s
   *  in the shell) — and the wordmark's default face too, unless
   *  `wordmark.font` overrides it. Single-quoted family names (rule 1, see
   *  `EMAIL_THEME`). Do not set this to an app's logo/script face even
   *  when that face used to double as the wordmark face before `wordmark`
   *  existed — see giftme's own `EMAIL_THEME.display` comment for why that
   *  coupling was wrong once the shell gained a separate wordmark slot. */
  display: string;
  /** Sans/body stack for meta text and the footer link. */
  body: string;
  /** Monospace stack for the kicker. */
  mono: string;
  ground: string;
  ink: string;
  ink2: string;
  ink3: string;
  hairline: string;
  accent: string;
  /** Distinct card/surface token, if the app's DESIGN.md defines one. */
  surface?: string;
  /**
   * Overrides `accent` as the CTA button's background colour. Defaults to
   * `accent` when omitted — most apps never set this.
   *
   * Exists for the case `resolveCtaColors` (below) can't solve by picking a
   * label colour: an app whose `accent` doesn't reach 4.5:1 against EITHER
   * `ground` or `ink`. Measured across the fleet, only giftme hits this
   * (best candidate 4.39:1) — every other app clears 4.5:1 with the right
   * label choice alone, so only giftme needs to set `ctaAccent` to a
   * different, higher-contrast colour for the CTA specifically, leaving its
   * brand `accent` (used elsewhere — e.g. the header rule) untouched.
   */
  ctaAccent?: string;
  /**
   * Optional override for the header wordmark's typography, for an app
   * whose real mark is more than "the app name in the display face" — e.g.
   * giftme's script logotype or vantage's coloured serif. Omitted entirely
   * by every app whose wordmark IS just the display face at the shell's
   * default treatment (uppercase, tracked, 600, muted `ink2`) — nothing
   * changes for those nine apps.
   */
  wordmark?: {
    /** Overrides `display` for the wordmark ONLY. Defaults to `display` —
     *  most apps' wordmark IS just their name in the heading face, so
     *  those apps never set this. Set it when an app has a genuinely
     *  distinct logo face from its heading face (e.g. giftme's Pacifico
     *  logo vs. its Baloo 2 heading face) — see `EMAIL_THEME.wordmark.font`
     *  in giftme's copy of this file for the worked example and the
     *  incident (a heading rendering in the logo's script face) that
     *  motivated splitting this out from `display`.
     *
     *  Still meaningful when `image` (below) is set: it styles the `alt`
     *  TEXT FALLBACK, not the image itself — see `image`'s own comment. */
    font?: string;
    /** Defaults to `name`. Case matters for a script face — its character
     *  often lives in its lowercase letterforms and connecting strokes.
     *  Also the default source for `image.alt` when that field omits its
     *  own — see `image`. */
    text?: string;
    /** px. Defaults to 15. Styles the `alt` fallback in image mode. */
    size?: number;
    /** Defaults to 600. Styles the `alt` fallback in image mode. */
    weight?: number;
    /** CSS letter-spacing value. Defaults to ".08em"; use "0" for a script
     *  face — tracking severs the joins a cursive is made of. Styles the
     *  `alt` fallback in image mode. */
    tracking?: string;
    /** Defaults to "uppercase". Styles the `alt` fallback in image mode. */
    transform?: 'uppercase' | 'none';
  } & (
    | {
        /**
         * Renders the wordmark as an `<img>` instead of text — for a mark
         * that plain text can never reproduce, e.g. giftme's real Pacifico
         * logotype. Naming a Google Font in a CSS `font-family` stack does
         * not load it, and this shell links no webfont by design (file
         * banner above), so a script wordmark set as TEXT falls through to
         * whatever the recipient's platform resolves the generic `cursive`
         * family to — measured as Apple Chancery on macOS Mail, Comic Sans
         * MS on Windows. Neither is the brand mark. `image` sidesteps the
         * whole problem: it's pixels, not a font a client might not load.
         *
         * `width`/`height` MUST also be passed as HTML attributes by the
         * renderer (Outlook ignores CSS dimensions on `<img>`), and the
         * renderer inlines `display:block;border:0` (Outlook borders linked
         * images; inline images pick up stray baseline space) — both are
         * `renderEmailShell`'s responsibility, not this config's.
         *
         * `alt` defaults to `text` above, then `name`, so a client with
         * images off still shows the app's name as text instead of nothing.
         *
         * Mutually exclusive with `parts` (below) BY TYPE, not just by
         * convention: an `alt` attribute is one plain string and cannot
         * carry a multi-tone split, so once an app sets `image` there is
         * nothing left for `parts` to do. `font`/`size`/`weight`/
         * `tracking`/`transform` above stay live even in image mode — they
         * style that `alt` fallback — which is exactly why they're still
         * worth setting for an app whose real mark is an image.
         */
        image: { url: string; width: number; height: number; alt?: string };
        parts?: never;
      }
    | {
        image?: undefined;
        /**
         * Renders the mark in segments, each in its own tone. Defaults to
         * the whole text as a single "ink2" part (today's default
         * treatment).
         *
         * An "accent" part renders under a DERIVED `{slug}-wordmark-accent`
         * class, never the shell's existing `accent` class — that class
         * maps to `background` in `DARK_PROPERTY` (the header rule, the CTA
         * cell). Reusing it for TEXT colour would paint a background block
         * behind the wordmark in a dark-scheme app instead of colouring its
         * text — the same one-class-two-properties bug `ctaLabelClass` was
         * split out to fix for the CTA label; see `DARK_PROPERTY`'s doc
         * comment.
         */
        parts?: ReadonlyArray<{ text: string; tone: 'ink' | 'ink2' | 'ink3' | 'accent' }>;
      }
  );
  /** CSS length, e.g. "18px" — used for the CTA button's border-radius. */
  radius: string;
  /** Lowercase, hyphen-free — becomes the `<slug>-<role>` class prefix. */
  slug: string;
  /**
   * Optional app-specific colour roles beyond the shell's core six (ground/
   * ink/ink2/ink3/hairline/accent) — e.g. tide's ledger rise/fall/pink-edge.
   * Kept OUT of the core light/dark shape (this type / `EmailThemeDark`) so
   * the other apps in the fleet, which don't have ledger-style semantics,
   * never have to carry tide's colours: `semantic` is entirely optional and
   * per-app, omittable by every app that doesn't need it.
   *
   * Each role carries its own `props` (the CSS propert(y/ies) its generated
   * dark rule overrides) right beside its `light`/`dark` values, rather
   * than in a separate module-level map keyed by role name. A separate map
   * was tried first and had two problems: every app copying this file
   * would inherit tide's own semantic property entries in a region the
   * file's banner otherwise declares invariant across all twelve apps, and
   * a role that forgot to declare its property fell back to `["color"]`
   * SILENTLY — the wrong property gets emitted instead of a build failing.
   * Requiring `props` on the entry itself makes an undeclared property a
   * type error instead of a guess, and keeps everything about one semantic
   * role in the one object that defines it.
   *
   * `generateDarkStyle` emits one generated rule per role that has a
   * `dark` value, exactly the same generated (never hand-written) way it
   * emits the core `dark` rules — so a semantic colour can never drift
   * from its dark counterpart the way the old hand-written `DARK_STYLE`
   * block in lib/email.ts once could. `dark` is optional per-role,
   * independent of the theme's own `scheme`/`dark` above: an app could in
   * principle want named semantic roles without shipping a second scheme
   * at all, or a light-only role inside an otherwise dark-capable theme.
   */
  semantic?: Record<string, { props: readonly string[]; light: string; dark?: string }>;
};

/**
 * `scheme` and `dark` are a discriminated union, not two independent
 * fields, because the two must agree: an app that claims `"light dark"`
 * without supplying `dark` values is a config that would tell a mail
 * client "I have a dark palette" and then not provide one — invisible
 * until someone reads the mail in dark mode. Typing it this way makes that
 * combination a compile error instead.
 *
 * `scheme: "light"` / `"dark"` forbid `dark` outright (not just make it
 * optional) so a light-only app can't accidentally carry stale dark values
 * that `wrapEmailDocument` would then never emit a rule for.
 */
export type EmailTheme = EmailThemeBase &
  (
    | { scheme: 'light dark'; dark: EmailThemeDark }
    | { scheme: 'light'; dark?: undefined }
    | { scheme: 'dark'; dark?: undefined }
  );

/**
 * pause's tokens, as literal hex (the banner above says why). `scheme: "light"`,
 * no `dark` block: pause has no dark palette, so none is invented here.
 */
export const EMAIL_THEME = {
  name: 'Pause',
  url: APP_URL,
  iconUrl: `${APP_URL}/icon-192.png`,
  // pause's face is Raleway for everything but the wordmark; Gmail strips
  // webfonts, so the stack falls back to a plain sans, which is honest.
  display: `'Raleway', 'Helvetica Neue', Arial, sans-serif`,
  body: `'Raleway', 'Helvetica Neue', Arial, sans-serif`,
  mono: `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`,
  ground: '#ffffff', // page
  ink: '#000000', // 21:1
  ink2: '#333333', // 12.6:1
  ink3: '#595959', // 7.0:1 (the app's --fleet-muted / --pause-muted)
  hairline: '#dcdcdc', // pause's rules
  accent: '#0edc00', // pause's green; CTA label color is derived by resolveCtaColors
  surface: '#f4f4f4', // --pause-wash
  radius: '5px', // pause's #save / #button-container corner
  slug: 'pause',
  scheme: 'light', // pause has no dark palette; none is invented
  wordmark: {
    font: `'Satisfy', cursive`,
    text: 'Pause',
    size: 26,
    weight: 400,
    tracking: '0',
    transform: 'none',
    image: { url: `${APP_URL}/icon-wordmark.png`, width: 120, height: 48 },
  },
} as const satisfies EmailTheme;

/**
 * CSS property (or properties) each dark-mode role overrides, keyed by the
 * same role name used in `EmailThemeDark` and in the `<slug>-<role>` class
 * it targets. Fixed per role because the shell markup below always uses a
 * given role for exactly one purpose: `ground` is ONLY the wrapper's
 * background, `ink`/`ink2`/`ink3` are ONLY text colours, `hairline` is
 * ONLY a border, `accent`/`surface` are ONLY backgrounds.
 *
 * `ground` used to also carry `color`, on the theory that the CTA anchor
 * could reuse the wrapper's own class to pick up its light-mode text
 * colour "for free" in dark mode too. That was the bug: a single
 * `.{slug}-ground { background:X !important; color:X !important; }` rule
 * applied to the anchor paints its own content box AND its text the same
 * colour, making the label invisible in any client honouring
 * `prefers-color-scheme`. The anchor now has its own class
 * (`ctaLabelClass`, below) so no single selector ever has to serve both a
 * background consumer and a text-colour consumer at once.
 */
// `null` marks a role that is a legal `EmailThemeDark` field but emits no
// rule of its own here — today only `ctaAccent`, which `resolveCtaColors`/
// `ctaAccentClass` below consume directly to compute the CTA button's dark
// background, never as a `.{slug}-ctaAccent` class (nothing in the shell
// markup carries that class; emitting one would be dead, camelCase CSS
// targeting no element). Distinguishing "deliberately no rule" (`null`)
// from "role I forgot to add" (absent from this map, see `generateDarkStyle`
// below) is exactly what keeps the second case a loud throw instead of a
// silent `['color']` guess.
const DARK_PROPERTY: Record<string, readonly string[] | null> = {
  ground: ['background'],
  ink: ['color'],
  ink2: ['color'],
  ink3: ['color'],
  hairline: ['border-color'],
  accent: ['background'],
  surface: ['background'],
  ctaAccent: null,
};

/**
 * WCAG 2.x contrast helpers, hex-only.
 *
 * Deliberately does NOT accept `rgba()`/`oklch()`/named colours — the
 * theme is documented literal-hex-only (see the file banner and every
 * `EmailTheme` field's own doc comment), so a caller passing anything else
 * is a theme error. Silently coercing or defaulting here would hide that
 * error instead of surfacing it as a thrown exception at the one place
 * that's cheap to fix — before the value ever reaches a sent email.
 */
function hexToRgb(hex: string): [r: number, g: number, b: number] {
  const body = hex.replace(/^#/, '');
  const full = body.length === 3 ? body.replace(/./g, (c) => c + c) : body;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`email-shell contrast helper: expected a 3- or 6-digit hex colour, got "${hex}"`);
  }
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Linearises one 0–255 sRGB channel per the WCAG formula (0.03928 is the
 *  spec's own threshold, not an approximation of it). */
function linearizeChannel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). Weights are the spec's
 *  own 0.2126/0.7152/0.0722, not a rounded approximation. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

/** WCAG contrast ratio between two hex colours, always ≥1. Symmetric in its
 *  two arguments — `(lighter + 0.05) / (darker + 0.05)` per spec, so which
 *  argument is visually lighter doesn't matter to the caller. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** One scheme's resolved CTA colours: which of `ground`/`ink` the label
 *  uses, the accent it sits on, and the ratio between them (so callers —
 *  chiefly the WCAG-floor test — can assert on it without recomputing). */
export type CtaColorResolution = { label: string; accent: string; ratio: number };

function resolveCtaColorsForScheme(ground: string, ink: string, accent: string): CtaColorResolution {
  const groundRatio = contrastRatio(ground, accent);
  const inkRatio = contrastRatio(ink, accent);
  // >= (not >) so a theme where the two ever tie keeps the old ground-wins
  // behaviour rather than flipping on floating-point noise.
  return groundRatio >= inkRatio
    ? { label: ground, accent, ratio: groundRatio }
    : { label: ink, accent, ratio: inkRatio };
}

/**
 * Picks the CTA label colour instead of hardcoding it to `ground`, which is
 * only correct when `ground` and `accent` have opposite lightness — a
 * theme with a dark accent on a light ground (tide) or a light accent on a
 * dark ground both happen to work, but a MID-lightness accent (the common
 * case: a saturated brand teal/purple/etc, not black or white) can leave
 * `ground` nearly as dark or light as the accent itself, failing WCAG AA.
 * Measured across the fleet: seven of eleven apps' `ground` fails 4.5:1
 * against their `accent` — tide's own passes, which is exactly why the bug
 * was invisible here. pause is one of the seven: its accent (#0edc00)
 * measures only 1.87:1 against `ground`, so this derivation resolving to
 * `ink` (11.26:1) is what keeps pause's CTA legible at all.
 *
 * Resolves BOTH schemes independently — the light and dark palettes are
 * unrelated colours, so the light winner (ground or ink) is not assumed to
 * carry over to dark; a theme needs its own answer for each.
 *
 * Reads `ctaAccent` (falling back to `accent`) for the accent each scheme
 * checks against, per-scheme — see `EmailThemeBase.ctaAccent`'s doc comment
 * for the one app (giftme) that needs it.
 */
export function resolveCtaColors(theme: EmailTheme): { light: CtaColorResolution; dark?: CtaColorResolution } {
  const light = resolveCtaColorsForScheme(theme.ground, theme.ink, theme.ctaAccent ?? theme.accent);
  if (!theme.dark) return { light };
  const dark = resolveCtaColorsForScheme(theme.dark.ground, theme.dark.ink, theme.dark.ctaAccent ?? theme.dark.accent);
  return { light, dark };
}

/**
 * The CTA anchor's own class. Deliberately NOT `{slug}-ground` (the
 * wrapper's background class) even though both USED TO derive their
 * light-mode value from `EMAIL_THEME.ground` — see the `DARK_PROPERTY`
 * comment above for why sharing one class there made the button invisible
 * in dark mode. The label's actual colour is now `resolveCtaColors`'
 * per-scheme winner (ground OR ink, whichever contrasts better against the
 * CTA accent), but the class still needs to be its own, independent of
 * `{slug}-ground`, for the same reason.
 * Not a field on `EmailTheme`: apps copying this file supply only colours,
 * so this role is derived here rather than becoming one more field an app
 * has to fill in.
 */
function ctaLabelClass(theme: EmailTheme): string {
  return `${theme.slug}-cta-label`;
}

/**
 * The CTA button cell's own background class. Deliberately NOT
 * `{slug}-accent` (the header rule's class) even though both derive their
 * light-mode value from `accent` by default: an app that sets `ctaAccent`
 * (see `EmailThemeBase.ctaAccent`) wants the CTA background to differ from
 * the brand accent used elsewhere (the header's 2px rule), and sharing one
 * class would force them to match.
 */
function ctaAccentClass(theme: EmailTheme): string {
  return `${theme.slug}-cta-accent`;
}

/**
 * The wordmark's own class for an "accent"-toned `wordmark.parts` segment.
 * Deliberately NOT `{slug}-accent` (the header rule's class, `background`
 * only in `DARK_PROPERTY`) — see the `wordmark.parts` doc comment on
 * `EmailThemeBase` for why sharing that class would paint a background
 * block behind the wordmark text in a dark-scheme app instead of colouring
 * it. Not itself a `DARK_PROPERTY` entry: `generateDarkStyle` below emits
 * this rule directly, mapped to `color` only, exactly once, the same way
 * `ctaLabelClass`/`ctaAccentClass` are generated rather than looked up.
 */
function wordmarkAccentClass(theme: EmailTheme): string {
  return `${theme.slug}-wordmark-accent`;
}

/** One `.{slug}-{role} { ...!important }` rule per key of `theme.dark`
 *  (property looked up in `DARK_PROPERTY`, the fixed core map), PLUS one
 *  per role of `theme.semantic` that declares a `dark` value (property
 *  taken from that role's OWN `props` field, never `DARK_PROPERTY` — see
 *  the `semantic` field's doc comment on `EmailThemeBase` for why), PLUS
 *  two extra rules for the CTA's own classes — the label's text colour
 *  (`ctaLabelClass`) and the button cell's background (`ctaAccentClass`),
 *  both computed by `resolveCtaColors(theme).dark` — all generated rather
 *  than hand-written so none of them can ever drift from the theme they
 *  mirror. `""` when the theme has no `dark` block at all — a theme with
 *  no dark scheme has nothing for semantic colours (or the CTA) to
 *  override either, so those rules are gated on `theme.dark`, not on any
 *  individual role's `dark` alone. */
function generateDarkStyle(theme: EmailTheme): string {
  if (!theme.dark) return '';
  const rules = Object.entries(theme.dark).flatMap(([role, value]) => {
    if (!(role in DARK_PROPERTY)) {
      // A role with no declared property must fail loudly, not guess
      // `['color']` and emit the wrong CSS property under a camelCase
      // class that matches nothing in the markup — see the DARK_PROPERTY
      // comment above for the incident this replaced.
      throw new Error(
        `generateDarkStyle: theme.dark.${role} has no DARK_PROPERTY entry — add one (or \`null\` if it deliberately emits no rule) before this theme can render.`,
      );
    }
    const props = DARK_PROPERTY[role];
    if (props === null) return [];
    const decls = props.map((p) => `${p}:${value} !important;`).join(' ');
    return [`  .${theme.slug}-${role} { ${decls} }`];
  });
  if (theme.semantic) {
    for (const [role, entry] of Object.entries(theme.semantic)) {
      if (entry.dark === undefined) continue;
      const decls = entry.props.map((p) => `${p}:${entry.dark} !important;`).join(' ');
      rules.push(`  .${theme.slug}-${role} { ${decls} }`);
    }
  }
  // The CTA label is a second, independent consumer of `ground`/`ink`: it
  // needs one of them as a TEXT colour, on top of the accent-coloured cell
  // it sits inside, never as a background of its own. Giving it its own
  // rule — instead of reusing `.{slug}-ground` above — is what keeps this
  // `color`-only declaration from colliding with that rule's `background`.
  // `theme.dark` is non-null here (checked above), so `resolveCtaColors`
  // is guaranteed to return a `dark` resolution.
  const darkCta = resolveCtaColors(theme).dark!;
  rules.push(`  .${ctaLabelClass(theme)} { color:${darkCta.label} !important; }`);
  // The CTA cell's own background class, separate from `.{slug}-accent`
  // (the header rule above, when `accent` is one of `theme.dark`'s keys) —
  // see `ctaAccentClass`'s doc comment for why they can't share a class.
  rules.push(`  .${ctaAccentClass(theme)} { background:${darkCta.accent} !important; }`);
  // The wordmark's own "accent"-toned segment, when the theme sets one via
  // `wordmark.parts` — `color` only, mirroring `theme.dark.accent` (the
  // same dark value the header rule's `background` uses), never sharing
  // `.{slug}-accent` itself. Gated on `theme.dark` (checked above) same as
  // every other rule here, so a dark-only app with no `dark` block (e.g.
  // vantage) emits no rule at all for this class, not an empty or
  // malformed one — its inline colour (the base `accent`) already IS its
  // only scheme.
  if (theme.wordmark?.parts?.some((p) => p.tone === 'accent')) {
    rules.push(`  .${wordmarkAccentClass(theme)} { color:${theme.dark.accent} !important; }`);
  }
  return `<style>@media (prefers-color-scheme: dark) {\n${rules.join('\n')}\n}</style>`;
}

/**
 * Renders the branded shell around a caller-supplied body fragment. Returns
 * a body fragment itself — no `<html>`, no `<head>`, no `<style>` — so
 * builders stay pure and their tests keep asserting on content rather than
 * document chrome. Only `wrapEmailDocument`, called once at send time, adds
 * the document-level pieces.
 *
 * `theme` defaults to this app's `EMAIL_THEME` and every real call site
 * should rely on that default — the parameter exists so tests can render
 * the same shell against a differently-configured theme (e.g. a different
 * `slug`, or a `scheme: "light"` theme with no `dark` block) without a
 * second copy of this function.
 */
export function renderEmailShell(
  parts: {
    kicker: string;
    heading?: string;
    meta?: string;
    /** An optional link rendered on its OWN line, right after `meta` (or
     *  in `meta`'s place when `meta` is absent). Deliberately its own `<p>`
     *  rather than sharing a line with `meta` via a " · " joiner: a joiner
     *  strands as a dangling separator the moment the link wraps to a new
     *  line, which a long URL does routinely in a ~530px-wide email column.
     *  `meta` itself stays a plain, escaped-as-a-whole string on purpose —
     *  a caller can't smuggle markup through it — but some callers need a
     *  genuinely clickable link, so this is a separate, narrowly-typed part
     *  instead of widening `meta` to accept HTML. `label` and `href` are
     *  both escaped individually — callers that want a short, readable
     *  label (e.g. a path instead of a full URL) compute it themselves
     *  before passing it in. */
    metaLink?: { label: string; href: string };
    body: string;
    cta?: { label: string; href: string };
  },
  theme: EmailTheme = EMAIL_THEME,
): string {
  const t = theme;
  const cls = (role: string) => `${t.slug}-${role}`;

  const headingHtml = parts.heading
    ? `<p class="${cls('ink')}" style="margin:12px 0 0;font-family:${t.display};font-size:20px;font-weight:600;color:${t.ink}">${escapeHtml(parts.heading)}</p>`
    : '';
  const metaHtml = parts.meta
    ? `<p class="${cls('ink3')}" style="margin:4px 0 0;font-family:${t.body};font-size:13px;color:${t.ink3}">${escapeHtml(parts.meta)}</p>`
    : '';
  // Own paragraph, not appended to metaHtml: see the `metaLink` doc comment
  // above for why sharing a line with a " · " joiner strands a dangling
  // separator when the link wraps.
  const metaLinkHtml = parts.metaLink
    ? `<p class="${cls('ink3')}" style="margin:4px 0 0;font-family:${t.body};font-size:13px"><a href="${escapeHtml(parts.metaLink.href)}" class="${cls('ink3')}" style="color:${t.ink3}">${escapeHtml(parts.metaLink.label)}</a></p>`
    : '';
  // A table, not a bare styled <a>. The anchor is `display:block` and
  // carries the padding itself, so the whole 44px button is the tap target
  // (padding on the <td> left only the ~16px label clickable). Outlook
  // desktop ignores padding on anchors, so the <td> restores the visual
  // size there through `mso-padding-alt`, which only Outlook reads. The label's colour is NOT
  // hardcoded to `ground` — it's `resolveCtaColors(t).light`, whichever of
  // `ground`/`ink` has the higher WCAG contrast against the CTA accent (see
  // `resolveCtaColors`'s doc comment for why a hardcoded `ground` fails
  // seven of eleven apps in the fleet). The CTA cell's background is
  // likewise `resolveCtaColors(t).light.accent` (theme's `ctaAccent`,
  // falling back to `accent`), not a bare `t.accent` read, so an app that
  // sets `ctaAccent` gets it here without a second code path. The anchor
  // gets its OWN class (`ctaLabelClass`), not the wrapper's `ground` class
  // — see `DARK_PROPERTY` for why reusing that class here previously made
  // the label invisible in dark mode — and the cell gets its own
  // (`ctaAccentClass`), not the header rule's `accent` class, for the
  // parallel reason documented on `ctaAccentClass`.
  const ctaColors = resolveCtaColors(t).light;
  const ctaHtml = parts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0"><tr>`
      + `<td class="${ctaAccentClass(t)}" style="background:${ctaColors.accent};border-radius:${t.radius};padding:0;mso-padding-alt:10px 20px">`
      + `<a href="${escapeHtml(parts.cta.href)}" class="${ctaLabelClass(t)}" style="display:block;padding:14px 20px;line-height:16px;font-family:${t.body};font-size:14px;font-weight:600;color:${ctaColors.label};text-decoration:none">${escapeHtml(parts.cta.label)}</a>`
      + `</td></tr></table>`
    : '';

  // Wordmark: `t.wordmark` overrides the shell's default treatment
  // (uppercase, tracked, 600, muted `ink2`) for an app with a defined mark
  // — see `wordmark`'s doc comment on `EmailThemeBase`. Every field falls
  // back to today's default when `t.wordmark` (or the field itself) is
  // absent, so a theme that never sets `wordmark` renders byte-identical
  // markup to before this existed — this is the nine-app regression guard.
  const wm = t.wordmark;
  const wordmarkParts: ReadonlyArray<{ text: string; tone: 'ink' | 'ink2' | 'ink3' | 'accent' }> =
    wm?.parts ?? [{ text: wm?.text ?? t.name, tone: 'ink2' }];
  // Defaults to `t.display` (the heading face) — NOT hardcoded to it,
  // because an app with a genuinely distinct logo face (giftme's Pacifico)
  // sets `wordmark.font` to override just this slot, leaving `t.display`
  // free to be the heading face everywhere else it's used (headingHtml,
  // below).
  const wordmarkFont = wm?.font ?? t.display;
  const wordmarkSize = wm?.size ?? 15;
  const wordmarkWeight = wm?.weight ?? 600;
  const wordmarkTracking = wm?.tracking ?? '.08em';
  const wordmarkTransform = wm?.transform ?? 'uppercase';
  // `tracking: "0"`/`transform: "none"` OMIT the declaration entirely
  // rather than emitting `letter-spacing:0`/`text-transform:none` — partly
  // to keep the no-wordmark case's generated style string byte-identical
  // to the shell's pre-wordmark output, and partly because "0" isn't a
  // real CSS length here (a script face wants no letter-spacing rule at
  // all, not a zero one some client could still round unpredictably).
  const wordmarkFontStyle =
    `font-family:${wordmarkFont};font-size:${wordmarkSize}px;font-weight:${wordmarkWeight};`
    + (wordmarkTracking !== '0' ? `letter-spacing:${wordmarkTracking};` : '')
    + (wordmarkTransform === 'uppercase' ? 'text-transform:uppercase;' : '');
  const wordmarkToneClass = (tone: 'ink' | 'ink2' | 'ink3' | 'accent') =>
    tone === 'accent' ? wordmarkAccentClass(t) : cls(tone);
  const wordmarkToneColor = (tone: 'ink' | 'ink2' | 'ink3' | 'accent') => t[tone];
  // A single part keeps the original one-`<td>` markup (and, for the
  // no-wordmark default, is byte-identical to the pre-wordmark line this
  // replaces); 2+ parts need their own `<span>` each, since a `<td>` can
  // carry only one `color`.
  //
  // `wm.image` (giftme's real Pacifico wordmark; see `image`'s own doc
  // comment on `EmailThemeBase.wordmark`) takes over the cell entirely,
  // rendering an `<img>` instead of the text spans below. `wordmarkFontStyle`
  // still lands on the cell in this branch too — NOT dropped — because it's
  // what styles the `alt` text if the image fails to load or the client has
  // images off: without it, that fallback would render in a default serif
  // instead of the wordmark's own script stack, which is exactly the
  // failure case `font`/`size`/`weight`/`tracking`/`transform` exist to
  // soften. `width`/`height` are emitted as HTML ATTRIBUTES, not only via
  // `wordmarkFontStyle`'s CSS — Outlook ignores CSS dimensions on `<img>`.
  // `display:block;border:0` are inlined for the same Outlook reasons the
  // header icon below states its own `display:block` for. `alt` falls back
  // to `wm.text` then `t.name`, mirroring the text branch's own default, so
  // a client with images off still shows "GiftMe" as text rather than
  // nothing.
  const wordmarkHtml = wm?.image
    ? `<td style="${wordmarkFontStyle}"><img src="${wm.image.url}" width="${wm.image.width}" height="${wm.image.height}" alt="${escapeHtml(wm.image.alt ?? wm.text ?? t.name)}" style="display:block;border:0"></td>`
    : wordmarkParts.length === 1
    ? `<td class="${wordmarkToneClass(wordmarkParts[0].tone)}" style="${wordmarkFontStyle}color:${wordmarkToneColor(wordmarkParts[0].tone)}">${escapeHtml(wordmarkParts[0].text)}</td>`
    : `<td style="${wordmarkFontStyle}">${wordmarkParts.map((p) => `<span class="${wordmarkToneClass(p.tone)}" style="color:${wordmarkToneColor(p.tone)}">${escapeHtml(p.text)}</span>`).join('')}</td>`;

  const hostname = t.url.replace(/^https?:\/\//, '');

  return (
    `<div class="${cls('ground')}" style="background:${t.ground};padding:24px 16px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto"><tr><td>`
    // Header: icon beside the wordmark, then a 2px accent rule. The rule is
    // a table cell background rather than a `border-*`, so its dark-mode
    // override only ever needs the `background` property (see
    // DARK_PROPERTY) instead of a second, border-specific one.
    + `<table role="presentation" cellpadding="0" cellspacing="0"><tr>`
    // alt="": the wordmark right beside this icon already names the app —
    // as its OWN `alt` in image mode (giftme's `wordmark.image.alt`), or as
    // its literal text in the default/`parts` mode. Either way there is
    // exactly one accessible name for the header, and it lives on the
    // wordmark, not here. An alt here of "Tide" would double it: read
    // twice by a screen reader, and shown twice over when a client has
    // images turned off (once from this icon's alt, once from the
    // wordmark's own name).
    + `<td style="padding:0 8px 0 0"><img src="${t.iconUrl}" width="28" height="28" alt="" style="display:block"></td>`
    + wordmarkHtml
    + `</tr></table>`
    + `<div class="${cls('accent')}" style="background:${t.accent};height:2px;line-height:2px;font-size:0;margin:8px 0 16px">&nbsp;</div>`
    // Content
    + `<p class="${cls('ink3')}" style="margin:0;font-family:${t.mono};font-size:11px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:${t.ink3}">${escapeHtml(parts.kicker)}</p>`
    + headingHtml
    + metaHtml
    + metaLinkHtml
    // `body` is trusted HTML from the caller, interpolated verbatim —
    // every other part above is a caller-supplied *string* and is escaped.
    + `<div style="margin:16px 0 0">${parts.body}</div>`
    + ctaHtml
    // Footer
    + `<div class="${cls('hairline')}" style="border-top:1px solid ${t.hairline};margin-top:24px;padding-top:0;mso-padding-alt:12px 0 0">`
    + `<a href="${t.url}" class="${cls('ink3')}" style="display:inline-block;padding:14px 0;line-height:16px;color:${t.ink3};font-family:${t.body};font-size:11px;text-decoration:none">${escapeHtml(hostname)}</a>`
    + `</div>`
    + `</td></tr></table>`
    + `</div>`
  );
}

/**
 * Applied at send time only — never inside a builder. Prefixes a rendered
 * body fragment with `<meta name="color-scheme">` and, only when the theme
 * has a `dark` block, a generated `<style>` block mirroring it. Builders
 * stay pure body fragments and only send sites call this, which is what
 * keeps the existing builder tests asserting on content instead of
 * document chrome.
 *
 * `theme` defaults to this app's `EMAIL_THEME`, same reasoning as
 * `renderEmailShell`'s `theme` parameter above.
 */
export function wrapEmailDocument(html: string, theme: EmailTheme = EMAIL_THEME): string {
  return `<meta name="color-scheme" content="${theme.scheme}">${generateDarkStyle(theme)}${html}`;
}

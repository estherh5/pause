import { describe, it, expect } from 'vitest';
import { EMAIL_THEME, renderEmailShell, wrapEmailDocument, contrastRatio, resolveCtaColors } from './email-shell';
import type { EmailTheme } from './email-shell';

describe('renderEmailShell', () => {
  it('renders every part when all are present', () => {
    const html = renderEmailShell({
      kicker: 'Kicker',
      heading: 'Heading',
      meta: 'Meta',
      body: '<p>Body</p>',
      cta: { label: 'Open', href: 'https://pause.crystalprism.io/x' },
    });
    expect(html).toContain('Kicker');
    expect(html).toContain('Heading');
    expect(html).toContain('Meta');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('Open');
    expect(html).toContain('https://pause.crystalprism.io/x');
  });

  it('renders with only kicker + body, and emits no leftover heading/meta/cta markup', () => {
    const html = renderEmailShell({ kicker: 'Kicker', body: '<p>Body</p>' });
    expect(html).toContain('Kicker');
    expect(html).toContain('<p>Body</p>');
    // font-size:20px only appears on the heading <p>; margin:4px 0 0 only
    // on the meta <p>; border-radius:<radius> only on the CTA cell.
    expect(html).not.toContain('font-size:20px');
    expect(html).not.toContain('margin:4px 0 0');
    expect(html).not.toContain(`border-radius:${EMAIL_THEME.radius}`);
  });

  it('escapes kicker, heading, meta, and cta.label; leaves body verbatim', () => {
    const html = renderEmailShell({
      kicker: '<kicker>',
      heading: '<heading>',
      meta: '<meta-line>',
      body: '<b>bold &amp; untouched</b>',
      cta: { label: '<label>', href: 'https://example.com/?a=1&b=2' },
    });
    expect(html).toContain('&lt;kicker&gt;');
    expect(html).toContain('&lt;heading&gt;');
    expect(html).toContain('&lt;meta-line&gt;');
    expect(html).toContain('&lt;label&gt;');
    expect(html).not.toContain('<kicker>');
    expect(html).not.toContain('<heading>');
    expect(html).not.toContain('<meta-line>');
    expect(html).not.toContain('<label>');
    // body is trusted HTML from the caller and is never escaped.
    expect(html).toContain('<b>bold &amp; untouched</b>');
  });

  it('derives every class prefix from theme.slug — no hardcoded pause- literal when the slug differs', () => {
    const { wordmark: _wordmark, ...noWordmark } = EMAIL_THEME;
    const altTheme: EmailTheme = { ...noWordmark, slug: 'acme' };
    const html = renderEmailShell({
      kicker: 'k',
      heading: 'h',
      meta: 'm',
      body: '<p>b</p>',
      cta: { label: 'l', href: 'https://example.com' },
    }, altTheme);
    expect(html).toContain('class="acme-ground"');
    expect(html).toContain('class="acme-ink"');
    expect(html).toContain('class="acme-ink2"');
    expect(html).toContain('class="acme-ink3"');
    expect(html).toContain('class="acme-accent"');
    expect(html).toContain('class="acme-hairline"');
    expect(html).toContain('class="acme-cta-label"');
    // "pause-" (with the hyphen) must not appear anywhere once the slug
    // is no longer "pause" — the only remaining "pause" text is the
    // app's own name/URL/icon path, none of which use a trailing hyphen.
    expect(html).not.toContain('pause-');
  });

  it("colours the CTA label with resolveCtaColors' winner, not a hardcoded token", () => {
    // pause's accent (#0edc00) is bright green, so a white label on it would
    // be illegible. The winner is `ink` (black); asserted
    // against the computed winner, not a bare EMAIL_THEME.ink read, so this
    // test still means the right thing if pause' palette ever changes
    // which token wins.
    const html = renderEmailShell({
      kicker: 'k',
      body: '<p>b</p>',
      cta: { label: 'Open', href: 'https://example.com' },
    });
    const anchor = html.match(/<a [^>]*class="pause-cta-label"[^>]*>/)?.[0] ?? '';
    expect(anchor).toContain(`color:${resolveCtaColors(EMAIL_THEME).light.label}`);
    expect(resolveCtaColors(EMAIL_THEME).light.label).toBe(EMAIL_THEME.ink);
  });

  it("gives the CTA anchor its own class, distinct from the wrapper's ground class", () => {
    // Regression test: an anchor and the wrapper <div> sharing one class
    // made the CTA label invisible in dark mode in tide — see the
    // DARK_PROPERTY comment in email-shell.ts. The anchor must never carry
    // "pause-ground".
    const html = renderEmailShell({
      kicker: 'k',
      body: '<p>b</p>',
      cta: { label: 'Open', href: 'https://example.com' },
    });
    const anchor = html.match(/<a [^>]*>Open<\/a>/)?.[0] ?? '';
    expect(anchor).toContain('class="pause-cta-label"');
    expect(anchor).not.toContain('class="pause-ground"');
  });
});

describe('resolveCtaColors', () => {
  // Minimal fields every EmailTheme needs beyond the ones each test below
  // varies. Values are arbitrary but valid hex — none of these fields
  // affect contrast, so they're shared to keep each test focused on the
  // one thing it's varying.
  const BASE = {
    name: 'Acme', url: 'https://example.com', iconUrl: 'https://example.com/icon.png',
    display: 'serif', body: 'sans-serif', mono: 'monospace',
    radius: '8px', slug: 'acme', scheme: 'light' as const, dark: undefined,
  };

  // THE regression test: a hardcoded `color: ground` derivation would pass
  // an app whose own accent is dark enough that ground wins, but silently
  // ship an illegible button on any theme shaped like these two — which is
  // exactly what going undetected in tide, then failing in seven of the
  // other apps (pause among them — see the test above), looked like. Two
  // directions, not one: a suite that only ever exercised the ground-wins
  // direction would not have caught the original bug either.
  it('resolves to ink when accent is LIGHT (ground would lose)', () => {
    const theme: EmailTheme = { ...BASE, ground: '#FFFFFF', ink: '#000000', accent: '#F5F0E6', hairline: '#DDDDDD', ink2: '#333333', ink3: '#555555' };
    const resolved = resolveCtaColors(theme).light;
    expect(resolved.label).toBe('#000000');
    expect(resolved.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('resolves to ground when accent is DARK (ink would lose)', () => {
    const theme: EmailTheme = { ...BASE, ground: '#FFFFFF', ink: '#000000', accent: '#101010', hairline: '#DDDDDD', ink2: '#333333', ink3: '#555555' };
    const resolved = resolveCtaColors(theme).light;
    expect(resolved.label).toBe('#FFFFFF');
    expect(resolved.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back to accent when ctaAccent is omitted', () => {
    const resolved = resolveCtaColors(EMAIL_THEME);
    expect(resolved.light.accent).toBe(EMAIL_THEME.accent);
    expect(resolved.dark).toBeUndefined();
  });

  it('contrastRatio is exact WCAG: black-on-white is 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5); // symmetric
  });

  it('contrastRatio handles 3-digit hex identically to its 6-digit expansion', () => {
    expect(contrastRatio('#000', '#FFF')).toBeCloseTo(contrastRatio('#000000', '#FFFFFF'), 10);
  });

  it('throws on a non-hex colour rather than silently falling back', () => {
    // The theme is documented hex-only (see resolveCtaColors' and the
    // contrast helpers' doc comments); an rgba() theme value is a theme
    // error that should fail loudly, not resolve to a wrong-looking button.
    const theme: EmailTheme = { ...BASE, ground: '#FFFFFF', ink: '#000000', accent: 'rgba(0,0,0,1)', hairline: '#DDDDDD', ink2: '#333333', ink3: '#555555' };
    expect(() => resolveCtaColors(theme)).toThrow();
  });

  // ---------------------------------------------------------------------
  // THE fan-out gate: this is what proves pause' CTA button is legible,
  // not a live inbox. A theme whose CTA label can't reach 4.5:1 against
  // its accent — including via ctaAccent — fails this test.
  // ---------------------------------------------------------------------
  it("EMAIL_THEME's resolved CTA colours meet WCAG AA (>=4.5:1)", () => {
    const { light, dark } = resolveCtaColors(EMAIL_THEME);
    expect(light.ratio).toBeGreaterThanOrEqual(4.5);
    expect(dark).toBeUndefined(); // pause is light-only — see EMAIL_THEME.scheme
  });

  // The small kicker/footer text (ink3) and the header wordmark fallback (ink2)
  // must clear WCAG AA against ground.
  it('ink2 and ink3 clear WCAG AA against ground', () => {
    expect(contrastRatio(EMAIL_THEME.ink2, EMAIL_THEME.ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(EMAIL_THEME.ink3, EMAIL_THEME.ground)).toBeGreaterThanOrEqual(4.5);
  });
});

// THE gate that would have caught the original bug: EMAIL_THEME.ink3 was
// filled in as `--parch-dim` (#B3A99A), mapped by CSS-custom-property NAME
// rather than by ROLE — `--parch-dim` is a dim background-family tone,
// never designed to carry text, and measured 1.88:1 against `ground`
// (barely visible) in the shell's three busiest quiet text spots: the
// kicker, the meta/metaLink lines, and the footer hostname. The CTA pair
// already had a WCAG-floor test (`resolveCtaColors`, above); body text —
// ink/ink2/ink3 against ground, and their dark counterparts against
// dark.ground when the theme has one — had none. Generic over ANY
// EmailTheme (not hardcoded to nexus's numbers), so this test travels with
// the file into every other app that copies it next, protecting each
// app's own palette rather than just the one that caught the bug.
describe('text role contrast', () => {
  const TEXT_ROLES = ['ink', 'ink2', 'ink3'] as const;

  it('every light text role (ink/ink2/ink3) clears 4.5:1 against ground, computed with the shell\'s own contrastRatio', () => {
    for (const role of TEXT_ROLES) {
      const ratio = contrastRatio(EMAIL_THEME[role], EMAIL_THEME.ground);
      expect(ratio, `${role} (${EMAIL_THEME[role]}) vs ground (${EMAIL_THEME.ground})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // pause' EMAIL_THEME has scheme: 'light' with no `dark` block — there is
  // no dark counterpart to check. Skipped explicitly (shows as skipped, not
  // passed, in the run) rather than left as a silently-passing no-op: a
  // test that passes only because the thing it checks is absent is worse
  // than no test, per the fan-out sweep this block came from.
  it.skip('every dark text role clears 4.5:1 against dark.ground, when the theme has a dark scheme (no-op: pause has no dark scheme)', () => {});

  // Switch-proof: a theme shaped like the pre-fix nexus (a background-tint
  // colour mapped onto a text role) must fail this exact assertion, so a
  // future app copying this file gets the same protection nexus does now.
  it('fails on a synthetic theme whose ink3 is a background-family tone, the shape of the original bug', () => {
    const brokenTheme: EmailTheme = {
      ...EMAIL_THEME,
      ink3: '#B3A99A', // --parch-dim — the exact value this test caught in nexus
    };
    expect(contrastRatio(brokenTheme.ink3, brokenTheme.ground)).toBeLessThan(4.5);
  });
});

describe('banned constructs', () => {
  const BANNED = [
    'var(', 'oklch(', 'color-mix(', '<svg',
    'display:flex', 'display:grid', '@font-face', 'position:absolute',
  ];

  it('a fully-populated shell contains none of them', () => {
    const html = renderEmailShell({
      kicker: 'k', heading: 'h', meta: 'm', body: '<p>b</p>',
      cta: { label: 'l', href: 'https://example.com' },
    });
    for (const b of BANNED) expect(html).not.toContain(b);
  });

  it("wrapEmailDocument's output contains none of them either", () => {
    const doc = wrapEmailDocument(renderEmailShell({ kicker: 'k', body: '<p>b</p>' }));
    for (const b of BANNED) expect(doc).not.toContain(b);
  });

  it('no font-family declaration contains a double-quote', () => {
    const html = renderEmailShell({
      kicker: 'k', heading: 'h', meta: 'm', body: '<p>b</p>',
      cta: { label: 'l', href: 'https://example.com' },
    });
    const decls = html.match(/font-family:[^;]*/g) ?? [];
    expect(decls.length).toBeGreaterThan(0);
    for (const d of decls) expect(d).not.toContain('"');
  });
});

describe("pause's own wordmark", () => {
  it('renders the Satisfy wordmark as an image with the app name as alt text', () => {
    const html = renderEmailShell({ kicker: 'k', body: '<p>b</p>' });
    expect(html).toContain('<img src="https://pause.crystalprism.io/icon-wordmark.png" width="120" height="48" alt="Pause"');
  });
});

// Task 8: `wordmark` lets an app override the shell's default header
// treatment (uppercase/tracked/600/ink2) for a REAL defined mark. This app's
// EMAIL_THEME sets an image wordmark, so the default-treatment test strips it
// and the other tests construct SYNTHETIC wordmarks.
describe('wordmark', () => {
  function wordmarkCell(html: string): string {
    // The wordmark markup sits between the icon <td> and the header
    // table's closing tag — isolate it so assertions about "no
    // text-transform:uppercase" etc. don't accidentally match the kicker
    // paragraph below, which legitimately carries that same declaration.
    return html.match(/alt="" style="display:block"><\/td>([\s\S]*?)<\/tr><\/table>/)?.[1] ?? '';
  }

  it("a theme with no wordmark renders exactly today's default treatment (nine-app regression guard)", () => {
    const { wordmark: _wordmark, ...noWordmark } = EMAIL_THEME;
    const html = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, noWordmark);
    expect(html).toContain(
      `<td class="${EMAIL_THEME.slug}-ink2" style="font-family:${EMAIL_THEME.display};font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${EMAIL_THEME.ink2}">${EMAIL_THEME.name}</td>`,
    );
  });

  it('parts render each segment in its own tone, and the accent segment uses the derived wordmark-accent class, not the accent class', () => {
    const altTheme: EmailTheme = {
      ...EMAIL_THEME,
      wordmark: { parts: [{ text: 'Foo', tone: 'ink' }, { text: 'Bar', tone: 'accent' }] },
    };
    const html = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, altTheme);
    const cell = wordmarkCell(html);
    expect(cell).toContain(`<span class="${EMAIL_THEME.slug}-ink" style="color:${EMAIL_THEME.ink}">Foo</span>`);
    expect(cell).toContain(`<span class="${EMAIL_THEME.slug}-wordmark-accent" style="color:${EMAIL_THEME.accent}">Bar</span>`);
    expect(cell).not.toContain(`class="${EMAIL_THEME.slug}-accent"`);
  });

  it('transform: "none" emits no text-transform:uppercase, and tracking: "0" emits no .08em, scoped to the wordmark cell', () => {
    const altTheme: EmailTheme = {
      ...EMAIL_THEME,
      wordmark: { text: 'Foo', tracking: '0', transform: 'none' },
    };
    const html = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, altTheme);
    const cell = wordmarkCell(html);
    expect(cell).not.toContain('text-transform:uppercase');
    expect(cell).not.toContain('.08em');
    // Sanity: the kicker elsewhere in the same document still DOES carry
    // uppercase — proves the assertions above are scoped, not vacuous.
    expect(html).toContain('text-transform:uppercase');
  });

  it('a contrast guard with teeth: an accent-toned wordmark part clears 4.5:1 against ground, or clears 3:1 with the wordmark at >=24px', () => {
    // Synthetic ground/accent pair engineered to land BELOW the 4.5:1 body
    // floor but AT/ABOVE the 3:1 large-text floor — this app has no real
    // wordmark to exercise, so the pair is chosen here rather than derived
    // from this app's own palette, which has no guaranteed relationship to
    // either floor. Mirrors the shape of giftme's real "Me" (its own
    // accent-on-ground), computed with this file's own contrastRatio
    // rather than a hand-checked number.
    const ground = '#FFFFFF';
    const accent = '#898989';
    const ratio = contrastRatio(accent, ground);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
    const size = 24;
    const altTheme: EmailTheme = {
      ...EMAIL_THEME,
      ground,
      accent,
      wordmark: { size, parts: [{ text: EMAIL_THEME.name, tone: 'accent' }] },
    };
    const html = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, altTheme);
    const cell = wordmarkCell(html);
    expect(cell).toContain(`font-size:${size}px`);
    const clearsBodyFloor = ratio >= 4.5;
    const clearsLargeTextFloor = ratio >= 3 && size >= 24;
    expect(clearsBodyFloor || clearsLargeTextFloor, `accent ${accent} vs ground ${ground} = ${ratio.toFixed(2)}:1 at ${size}px`).toBe(true);
  });

  it('shrinking the wordmark below 24px would fail the contrast guard (proves the guard has teeth)', () => {
    const ratio = contrastRatio('#898989', '#FFFFFF');
    const shrunkSize = 20;
    const clearsBodyFloor = ratio >= 4.5;
    const clearsLargeTextFloor = ratio >= 3 && shrunkSize >= 24;
    expect(clearsBodyFloor || clearsLargeTextFloor).toBe(false);
  });

  it('a scheme: "light dark" theme with a wordmark accent part emits a well-formed derived dark rule, mapped to color only', () => {
    const dualTheme: EmailTheme = {
      ...EMAIL_THEME,
      scheme: 'light dark',
      dark: { ground: '#000000', ink: '#FFFFFF', ink2: '#CCCCCC', ink3: '#999999', hairline: '#222222', accent: '#FF00FF' },
      wordmark: { parts: [{ text: EMAIL_THEME.name, tone: 'accent' }] },
    };
    const doc = wrapEmailDocument('<p>x</p>', dualTheme);
    const style = doc.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const rules = style.match(new RegExp(`\\.${EMAIL_THEME.slug}-wordmark-accent\\s*\\{[^}]*\\}`, 'g')) ?? [];
    expect(rules.length).toBe(1);
    expect(rules[0]).toBe(`.${EMAIL_THEME.slug}-wordmark-accent { color:#FF00FF !important; }`);
    expect(rules[0]).not.toContain('background');
  });
});


// Task 10 fan-out: `wordmark.image` lets an app render its wordmark as an
// `<img>` instead of text, for a mark plain text can never reproduce (e.g.
// giftme's real Pacifico logotype — naming a Google Font in a CSS
// `font-family` stack never loads it in mail). This app's own EMAIL_THEME
// does not set `wordmark.image` — only giftme's does — so every test below
// exercises the mechanism through a SYNTHETIC theme, proving the shared
// shell code renders correctly if this app ever needs it, without shipping
// a PNG asset of its own. See giftme's `EMAIL_THEME.wordmark.image` and its
// own doc comment for the real, populated case.
describe('wordmark image', () => {
  function wordmarkCell(html: string): string {
    return html.match(/alt="" style="display:block"><\/td>([\s\S]*?)<\/tr><\/table>/)?.[1] ?? '';
  }

  it('renders an <img> with width/height as HTML attributes (Outlook ignores CSS dimensions), display:block, border:0, and an alt', () => {
    const theme: EmailTheme = {
      ...EMAIL_THEME,
      wordmark: { image: { url: 'https://example.com/logo.png', width: 100, height: 40, alt: 'Synthetic Mark' } },
    };
    const html = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, theme);
    const img = html.match(/<img src="https:\/\/example\.com\/logo\.png"[^>]*>/)?.[0] ?? '';
    expect(img).not.toBe(''); // proves the match isn't vacuous
    expect(img).toContain('width="100"');
    expect(img).toContain('height="40"');
    expect(img).toContain('alt="Synthetic Mark"');
    expect(img).toContain('display:block');
    expect(img).toContain('border:0');
  });

  it('alt falls back to wordmark.text, then theme.name, when image.alt is omitted', () => {
    const withText: EmailTheme = {
      ...EMAIL_THEME,
      wordmark: { text: 'Fallback Text', image: { url: 'https://example.com/logo.png', width: 100, height: 40 } },
    };
    const htmlWithText = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, withText);
    expect(htmlWithText).toContain(`alt="Fallback Text"`);

    const withoutText: EmailTheme = {
      ...EMAIL_THEME,
      wordmark: { image: { url: 'https://example.com/logo.png', width: 100, height: 40 } },
    };
    const htmlWithoutText = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, withoutText);
    expect(htmlWithoutText).toContain(`alt="${EMAIL_THEME.name}"`);
  });

  it('keeps the font-family declaration on the wordmark cell even in image mode, for the alt fallback', () => {
    const theme: EmailTheme = {
      ...EMAIL_THEME,
      wordmark: { font: `'Courier New', monospace`, image: { url: 'https://example.com/logo.png', width: 100, height: 40 } },
    };
    const html = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, theme);
    const cell = wordmarkCell(html);
    expect(cell).toContain(`font-family:'Courier New', monospace`);
  });

  it('the header icon still carries alt="" in image mode — exactly one accessible name in the header, carried by the wordmark\'s own alt', () => {
    const theme: EmailTheme = {
      ...EMAIL_THEME,
      wordmark: { image: { url: 'https://example.com/logo.png', width: 100, height: 40, alt: 'Synthetic Mark' } },
    };
    const html = renderEmailShell({ kicker: 'k', body: '<p>b</p>' }, theme);
    const iconImg = html.match(/<img src="[^"]*" width="28" height="28"[^>]*>/)?.[0] ?? '';
    expect(iconImg).not.toBe(''); // proves the match isn't vacuous
    expect(iconImg).toContain('alt=""');
  });
});

describe('wrapEmailDocument', () => {
  it('a light-only theme (pause\' own EMAIL_THEME) emits content="light" and no dark media block at all', () => {
    const doc = wrapEmailDocument('<p>x</p>');
    expect(doc).toContain('content="light"');
    expect(doc).not.toContain('@media (prefers-color-scheme: dark)');
    expect(doc).not.toContain('<style>');
  });

  it('carries EMAIL_THEME.scheme into the color-scheme meta by default', () => {
    const doc = wrapEmailDocument('<p>x</p>');
    expect(doc).toContain(`content="${EMAIL_THEME.scheme}"`);
  });

  it('a "light dark" theme still emits one dark rule per key of theme.dark plus the two CTA rules, each carrying !important', () => {
    // pause itself never exercises this path (scheme: "light", no dark
    // block) — this proves the shared generator (copied byte-identical
    // from tide) still works correctly when a differently-configured
    // theme IS given a dark block, so a future pause dark palette isn't
    // the first time this code path runs.
    const darkTheme: EmailTheme = {
      ...EMAIL_THEME,
      scheme: 'light dark',
      dark: { ground: '#0A0A0A', ink: '#FAFAFA', ink2: '#CCCCCC', ink3: '#999999', hairline: '#222222', accent: '#33C39B' },
    };
    const doc = wrapEmailDocument(
      renderEmailShell({ kicker: 'k', body: '<p>b</p>', cta: { label: 'Open', href: 'https://example.com' } }, darkTheme),
      darkTheme,
    );
    const style = doc.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const ruleBlocks = style.match(/\.pause-[a-zA-Z0-9]+\s*\{[^}]*\}/g) ?? [];
    expect(ruleBlocks.length).toBe(Object.keys(darkTheme.dark!).length);
    for (const block of ruleBlocks) expect(block).toContain('!important');
  });

  // The hole this closes: `DARK_PROPERTY[role] ?? ['color']` used to guess
  // `color` for any undeclared role, so a theme setting `dark.ctaAccent`
  // (a legal `EmailThemeDark` field) emitted a spurious, camelCase, no-op
  // `.pause-ctaAccent { color:... !important; }` rule. `ctaAccent` is
  // consumed by resolveCtaColors/ctaAccentClass instead, never emitted as
  // its own class.
  it('a theme with dark.ctaAccent set emits no ctaAccent rule and no camelCase class', () => {
    const theme: EmailTheme = {
      ...EMAIL_THEME,
      scheme: 'light dark',
      dark: { ground: '#0A0A0A', ink: '#FAFAFA', ink2: '#CCCCCC', ink3: '#999999', hairline: '#222222', accent: '#33C39B', ctaAccent: '#123456' },
    };
    const doc = wrapEmailDocument('<p>x</p>', theme);
    const style = doc.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(style).not.toContain('ctaAccent');
    expect(style).not.toMatch(/\.pause-[a-z]+[A-Z]/);
  });

  // The other half of the same fix: a role with genuinely no DARK_PROPERTY
  // entry must throw, loudly, instead of silently guessing `['color']`.
  it('throws for a theme.dark role with no DARK_PROPERTY entry', () => {
    const theme = {
      ...EMAIL_THEME,
      scheme: 'light dark',
      dark: { ground: '#0A0A0A', ink: '#FAFAFA', ink2: '#CCCCCC', ink3: '#999999', hairline: '#222222', accent: '#33C39B', bogusRole: '#123456' },
    } as unknown as EmailTheme;
    expect(() => wrapEmailDocument('<p>x</p>', theme)).toThrow(/bogusRole/);
  });

  it("keeps the CTA label's dark-mode text colour and its cell's dark-mode background on separate rules with different values", () => {
    const darkTheme: EmailTheme = {
      ...EMAIL_THEME,
      scheme: 'light dark',
      dark: { ground: '#0A0A0A', ink: '#FAFAFA', ink2: '#CCCCCC', ink3: '#999999', hairline: '#222222', accent: '#33C39B' },
    };
    const html = renderEmailShell({
      kicker: 'k',
      body: '<p>b</p>',
      cta: { label: 'Open', href: 'https://example.com' },
    }, darkTheme);
    const doc = wrapEmailDocument(html, darkTheme);
    const style = doc.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

    const wrapperRule = style.match(/\.pause-ground\s*\{[^}]*\}/)?.[0] ?? '';
    const labelRule = style.match(/\.pause-cta-label\s*\{[^}]*\}/)?.[0] ?? '';
    const cellRule = style.match(/\.pause-cta-accent\s*\{[^}]*\}/)?.[0] ?? '';

    expect(wrapperRule).toContain('background');
    expect(wrapperRule).not.toContain('color:');
    expect(labelRule).toContain('color:');
    expect(labelRule).not.toContain('background');

    const labelColor = labelRule.match(/color:(#[0-9A-Fa-f]+)/)?.[1];
    const cellBg = cellRule.match(/background:(#[0-9A-Fa-f]+)/)?.[1];
    expect(labelColor).toBeDefined();
    expect(cellBg).toBeDefined();
    expect(labelColor).not.toBe(cellBg);

    const anchor = html.match(/<a [^>]*>Open<\/a>/)?.[0] ?? '';
    expect(anchor).toContain('class="pause-cta-label"');
    expect(anchor).not.toContain('class="pause-ground"');
  });
});

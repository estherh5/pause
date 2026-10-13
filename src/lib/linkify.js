// Turn plain user-entered text into a token stream of text + links, without
// dangerouslySetInnerHTML. Handles scheme URLs (https://…), www.… and bare
// domains (crystalprism.io/path); skips email addresses and trailing sentence
// punctuation. Pure + synchronous so it can be unit-tested.
//
// A token is { type: "text", value } or { type: "link", value, href }.

// A URL candidate: explicit scheme, www., or a bare dotted domain with a 2+
// char TLD, each optionally followed by a path/query/fragment.
const URL_RE =
  /(https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<]*)?/gi;

// Trailing chars that are almost always sentence punctuation, not URL (parens
// and brackets are handled separately so balanced pairs inside a URL survive).
const TRAILING = /[.,;:!?'"]+$/;

function trimUrl(raw) {
  let url = raw;
  for (;;) {
    const before = url;
    url = url.replace(TRAILING, "");
    // Drop an unbalanced closing bracket (sentence punctuation), keep balanced ones.
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (
        url.endsWith(close) &&
        (url.split(open).length - 1) < (url.split(close).length - 1)
      ) {
        url = url.slice(0, -1);
      }
    }
    if (url === before) return url;
  }
}

export function tokenizeLinks(text) {
  const tokens = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    // Skip the domain half of an email address (foo@gmail.com).
    if (start > 0 && text[start - 1] === "@") continue;

    const url = trimUrl(match[0]);
    if (!url) continue;

    if (start > last) tokens.push({ type: "text", value: text.slice(last, start) });
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    tokens.push({ type: "link", value: url, href });
    last = start + url.length; // trailing punctuation stays for the next text run
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

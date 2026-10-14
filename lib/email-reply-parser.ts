// Extracts the user's newly-typed text from an inbound email reply, discarding
// the quoted history, and detects auto-responders. Pure and dependency-free.

// Sentinel placed at the TOP of every outbound body. Mail clients quote the
// whole received message below the user's reply, so cutting at this line keeps
// only what they typed.
export const REPLY_SEPARATOR = "––– Reply above this line –––";

// The "On <date> <someone> wrote:" attribution a mail client writes above the
// quoted block. Gmail wraps it onto a second line and Apple Mail quotes it
// behind "> ". Bounded so it cannot swallow real prose that merely opens with
// "On": lazily, at most 400 characters, and never across a blank line (an
// attribution wraps, it does not contain empty lines).
export const WRAPPED_ATTRIBUTION = /^(?:>\s*)?On\s(?:[^\n]|\n(?!\n)){0,400}?\bwrote:[ \t]*$/m;

// Everything from the earliest of these down is the client's, not the user's:
// the attribution, forwarded-message headers, and the signature or mobile
// footer that sits between the reply and the quote. They run AFTER a sentinel
// cut too, because the sentinel is quoted BELOW the attribution and signature.
const CUT_MARKERS: RegExp[] = [
  WRAPPED_ATTRIBUTION,
  /^-{2,}\s*Original Message\s*-{2,}$/im,
  /^_{5,}$/m,
  /^From:\s.+$/m,
  /^-- ?$/m,
  /^Sent from my \S.*$/im,
  /^Get Outlook for .*$/im,
];

export function stripQuotedReply(rawText: string): string {
  let text = rawText.replace(/\r\n/g, "\n").replace(/\uFEFF/g, "");
  const sepIdx = text.indexOf(REPLY_SEPARATOR);
  if (sepIdx !== -1) text = text.slice(0, sepIdx);
  let cut = text.length;
  for (const re of CUT_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  const lines = text.slice(0, cut).split("\n");
  while (lines.length && /^\s*(>.*)?$/.test(lines[lines.length - 1])) lines.pop();
  return lines.join("\n").trim();
}

export function isAutoReply(headers: Record<string, string>): boolean {
  const get = (k: string) => (headers[k] ?? headers[k.toLowerCase()] ?? "").toLowerCase();
  const autoSubmitted = get("Auto-Submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = get("Precedence");
  if (precedence === "bulk" || precedence === "auto_reply" || precedence === "junk") return true;
  if (get("X-Autoreply") === "yes" || get("X-Autorespond")) return true;
  return false;
}

// After a deploy, a tab opened on the previous build still asks for that build's
// hashed chunks (e.g. assets/Chart-AIWB1NBN.css). Vercel no longer serves them, so
// the lazy import fails with "Unable to preload CSS" and the page breaks. Vite
// fires `vite:preloadError` for exactly this; reloading fetches the new index.html
// and its new chunk names. Reload at most once per WINDOW_MS, so a chunk that is
// missing for some other reason surfaces as a normal error (and reaches flare)
// instead of looping.
export const WINDOW_MS = 10_000;
const KEY = 'pause:stale-chunk-reload-at';

/** True when a reload should be attempted now; records the attempt. */
export function shouldReload(storage, now) {
  let last = 0;
  try {
    last = Number(storage.getItem(KEY)) || 0;
  } catch {
    return false; // No storage, no loop guard: let the error surface.
  }
  if (now - last < WINDOW_MS) return false;
  try {
    storage.setItem(KEY, String(now));
  } catch {
    return false;
  }
  return true;
}

export function installStaleChunkReload(win = window) {
  win.addEventListener('vite:preloadError', (event) => {
    if (!shouldReload(win.sessionStorage, Date.now())) return;
    event.preventDefault();
    win.location.reload();
  });
}

/**
 * The fleet kit renders plain <a href> rows (it is byte-identical across apps
 * and knows no router), so "Stats" would be a full page load that throws away
 * the plan on screen. Route same-origin, non-API links through the router
 * instead, and close the kit's panel with the Escape its own listener handles.
 * An anchor marked data-reload stays a real page load (the planner title).
 */
export function interceptInternalLinks(navigate) {
  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('data-reload') || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return;
    e.preventDefault();
    if (a.closest('.fleet-panel')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    navigate(`${url.pathname}${url.search}${url.hash}`);
  }
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}

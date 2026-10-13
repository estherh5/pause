/** What the bottom-right "+" does per page (DESIGN.md Floating buttons), one table. */
const NEW_PLAN = { label: 'New plan', action: 'new-plan' };
const under = (path, root) => path === root || path.startsWith(`${root}/`);

export function fabFor(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/plans') return NEW_PLAN;
  // The planner is itself the add form; the rest have nothing to add.
  if (path === '/' || path === '/stats' || path === '/settings' || path === '/signin' || path === '/privacy') return null;
  if (under(path, '/admin') || under(path, '/invite')) return null;
  return NEW_PLAN; // a page added later, until it gets its own row
}

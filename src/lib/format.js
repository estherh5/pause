const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse an ISO date or datetime without timezone surprises (treats it as local). */
function parseLocal(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(+y, +mo - 1, +d, h ? +h : 0, mi ? +mi : 0);
}

export function formatDate(iso) {
  const d = iso ? parseLocal(iso) : null;
  if (!d) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatShortDate(iso) {
  const d = iso ? parseLocal(iso) : null;
  if (!d) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatTime(iso) {
  const d = iso ? parseLocal(iso) : null;
  if (!d || !/[T ]\d{2}:\d{2}/.test(iso ?? '')) return '';
  let h = d.getHours();
  const mi = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mi} ${ap}`;
}

export function formatDateTime(iso) {
  const date = formatShortDate(iso);
  const time = formatTime(iso);
  return [date, time].filter(Boolean).join(' · ');
}

/** Inclusive day count between two ISO dates, or null. */
export function durationDays(start, end) {
  const a = start ? parseLocal(start) : null;
  const b = end ? parseLocal(end) : null;
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}

/** Current datetime as a value suitable for <input type="datetime-local">. */
export function nowLocalInput() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export { parseLocal };

import Please from './Please.js';

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function createStartingActivities() {
  return [
    { id: 0, value: 24, label: '', color: '#DCDCDC' },
    { id: '?', value: '', label: '' },
  ];
}

export function createPeriodState(dayCount) {
  return Array.from({ length: dayCount }, (_, index) => index).reduce(
    (period, index) => {
      period.activities[index] = createStartingActivities();
      period.chartTypes[index] = 'pie';
      return period;
    },
    { activities: {}, chartTypes: {} },
  );
}

const isReal = ({ id }) => !['?', 0].includes(id);

/** One color per activity across the whole plan: "Sleep" on Monday is
 *  "Sleep" on Friday, and stays so through edits, starters and reloads.
 *  Keyed by the trimmed, case-folded label; an unnamed row keys by its id. */
const colorKey = (activity) => (activity.label ?? '').trim().toLowerCase() || `#${activity.id}`;

/** label key -> color, first occurrence wins, days in order. */
export function planPalette(activitiesByDay) {
  const palette = new Map();
  Object.keys(activitiesByDay ?? {})
    .sort((a, b) => Number(a) - Number(b))
    .forEach((day) => activitiesByDay[day].forEach((activity) => {
      const key = colorKey(activity);
      if (isReal(activity) && activity.color && !palette.has(key)) palette.set(key, activity.color);
    }));
  return palette;
}

// Deterministic, so a new label lands on the same hue every time. A string
// hash picks the starting hue; the golden angle steps away from hues already
// in use so two activities never sit side by side on the wheel.
const GOLDEN_ANGLE = 137.508;
function hashHue(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

function pickColor(key, usedHues) {
  const spacing = Math.min(40, 180 / (usedHues.length + 1));
  let best = hashHue(key);
  let bestGap = -1;
  for (let step = 0; step < 24; step++) {
    const hue = (hashHue(key) + step * GOLDEN_ANGLE) % 360;
    const gap = usedHues.length ? Math.min(...usedHues.map((u) => hueGap(u, hue))) : 360;
    if (gap >= spacing) { best = hue; break; }
    if (gap > bestGap) { best = hue; bestGap = gap; }
  }
  usedHues.push(best);
  return Please.HSV_to_HEX({ h: best, s: 1, v: 1 });
}

const hueOf = (hex) => Please.HEX_to_HSV(hex).h;

/**
 * Colors one day's activities against the plan's palette: a label already in
 * the plan takes that color, a row that already has a color keeps it, and
 * only a genuinely new label gets a new one.
 */
export function addActivityColors(activities, palette = new Map()) {
  const known = new Map(palette);
  const usedHues = [...known.values()].map(hueOf);
  return activities.map((activity) => {
    if (!isReal(activity)) return { ...activity };
    const key = colorKey(activity);
    if (!known.has(key)) {
      // A renamed row keeps its color unless another label owns it, so a new
      // name never reads as the old activity on the other days.
      const owned = new Set(known.values());
      const keep = activity.color && !owned.has(activity.color);
      if (keep) usedHues.push(hueOf(activity.color));
      known.set(key, keep ? activity.color : pickColor(key, usedHues));
    }
    return { ...activity, color: known.get(key) };
  });
}

/** Every day recolored against one palette, so a label matches across days. */
export function colorPlan(activitiesByDay) {
  const palette = planPalette(activitiesByDay);
  return Object.fromEntries(Object.entries(activitiesByDay ?? {}).map(([day, activities]) => {
    const colored = addActivityColors(activities, palette);
    colored.forEach((a) => { if (isReal(a) && !palette.has(colorKey(a))) palette.set(colorKey(a), a.color); });
    return [day, colored];
  }));
}

export function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

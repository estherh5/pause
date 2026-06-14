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

export function addActivityColors(activities) {
  const realActivities = activities.filter(({ id }) => !['?', 0].includes(id));

  if (realActivities.length === 0) {
    return activities.map((activity) => ({ ...activity }));
  }

  const [baseColor] = Please.make_color({
    saturation: 1,
    value: 1,
    golden: true,
    format: 'hsv',
  });
  const colors = Please.make_scheme(
    baseColor,
    { scheme_type: 'analogous' },
    realActivities.length,
  );
  let colorIndex = 0;

  return activities.map((activity) => {
    if (['?', 0].includes(activity.id)) {
      return { ...activity };
    }

    return { ...activity, color: colors[colorIndex++] };
  });
}

export function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

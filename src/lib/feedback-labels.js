export const TYPE_LABEL = { bug: 'Bug', idea: 'Idea', other: 'Other' };

export const TYPE_OPTIONS = [
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idea' },
  { value: 'other', label: 'Other' },
];

export const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'addressed', label: 'Addressed' },
  { value: 'declined', label: 'Declined' },
];

export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.value, s.label]));

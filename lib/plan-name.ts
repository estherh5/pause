export const MAX_NAME_LENGTH = 80;
// C0 controls and DEL; line breaks and tabs are the ones people actually paste.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001f\u007f]/;

export function nameKey(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function validatePlanName(raw: unknown): { ok: true; name: string; key: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Name the plan.' };
  const name = raw.normalize('NFC').trim();
  if (!name) return { ok: false, error: 'Name the plan.' };
  if (CONTROL.test(name)) return { ok: false, error: "Names can't contain line breaks or tabs." };
  if ([...name].length > MAX_NAME_LENGTH) return { ok: false, error: 'Keep the name to 80 characters.' };
  return { ok: true, name, key: nameKey(name) };
}

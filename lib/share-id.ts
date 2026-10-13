import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Same shape as pause_api's generate_external_id(16): letters + digits, CSPRNG. */
export function newShareId(): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
/** Legacy ids are NOT regex-gated (an older API may have used another shape);
 *  this only bounds what a lookup will accept. */
export const MAX_SHARE_ID_LENGTH = 64;

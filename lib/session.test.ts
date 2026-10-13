import { describe, it, expect } from 'vitest';
import { sessionUser } from './session.js';
import type { VercelRequest } from './vercel.js';

const req = (cookie: string) => ({ headers: { cookie } }) as unknown as VercelRequest;

describe('sessionUser with a malformed cookie', () => {
  it('a bad percent-escape reads as signed out instead of throwing', async () => {
    expect(await sessionUser(req('crystalprism.session-token=%zz'))).toBeNull();
  });
});

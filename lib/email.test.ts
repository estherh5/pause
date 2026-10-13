import { it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("defaults to pause's own sender", async () => {
  vi.stubEnv('EMAIL_FROM', '');
  vi.resetModules();
  expect((await import('./email.js')).FROM).toBe('Pause <pause@crystalprism.io>');
});

it('uses EMAIL_FROM when it is set (a local override only)', async () => {
  vi.stubEnv('EMAIL_FROM', 'Local <local@example.com>');
  vi.resetModules();
  expect((await import('./email.js')).FROM).toBe('Local <local@example.com>');
});

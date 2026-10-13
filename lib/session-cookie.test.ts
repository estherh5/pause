import { describe, it, expect } from 'vitest';
import { sessionCookieConfig } from './session-cookie';

describe('sessionCookieConfig', () => {
  it('dev: no __Secure- prefix, not secure, no domain', () => {
    const cfg = sessionCookieConfig({ NODE_ENV: 'development' });
    expect(cfg.name).toBe('crystalprism.session-token');
    expect(cfg.options.secure).toBe(false);
    expect(cfg.options).not.toHaveProperty('domain');
  });

  it('preview: prefix + secure, still no domain', () => {
    const cfg = sessionCookieConfig({ NODE_ENV: 'production', VERCEL_ENV: 'preview' });
    expect(cfg.name).toBe('__Secure-crystalprism.session-token');
    expect(cfg.options.secure).toBe(true);
    expect(cfg.options).not.toHaveProperty('domain');
  });

  it('full production: prefix + secure + .crystalprism.io domain', () => {
    const cfg = sessionCookieConfig({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    expect(cfg.name).toBe('__Secure-crystalprism.session-token');
    expect(cfg.options.secure).toBe(true);
    expect(cfg.options.domain).toBe('.crystalprism.io');
  });

  it('always sets httpOnly, lax sameSite, root path', () => {
    const cfg = sessionCookieConfig({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    expect(cfg.options.httpOnly).toBe(true);
    expect(cfg.options.sameSite).toBe('lax');
    expect(cfg.options.path).toBe('/');
  });
});

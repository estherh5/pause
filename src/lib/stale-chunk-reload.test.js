import { describe, expect, it, vi } from 'vitest';
import { installStaleChunkReload, shouldReload, WINDOW_MS } from './stale-chunk-reload.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

describe('shouldReload', () => {
  it('reloads the first time, then not again inside the window', () => {
    const s = memory();
    expect(shouldReload(s, 1_000_000)).toBe(true);
    expect(shouldReload(s, 1_000_000 + WINDOW_MS - 1)).toBe(false);
  });

  it('reloads again once the window has passed', () => {
    const s = memory();
    shouldReload(s, 1_000_000);
    expect(shouldReload(s, 1_000_000 + WINDOW_MS)).toBe(true);
  });

  it('never reloads when storage throws, so a missing chunk cannot loop', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(shouldReload(broken, 1_000_000)).toBe(false);
  });
});

describe('installStaleChunkReload', () => {
  it('reloads once and suppresses the error on the first preload failure only', () => {
    const listeners = {};
    const reload = vi.fn();
    const win = {
      addEventListener: (t, f) => { listeners[t] = f; },
      sessionStorage: memory(),
      location: { reload },
    };
    installStaleChunkReload(win);
    const first = { preventDefault: vi.fn() };
    listeners['vite:preloadError'](first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.preventDefault).toHaveBeenCalled();
    const second = { preventDefault: vi.fn() };
    listeners['vite:preloadError'](second);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });
});

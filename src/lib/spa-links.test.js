import { afterEach, describe, expect, it, vi } from 'vitest';
import { interceptInternalLinks } from './spa-links.js';

afterEach(() => { document.body.innerHTML = ''; });
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));

describe('interceptInternalLinks', () => {
  it('routes same-origin app paths through navigate and closes the fleet panel', () => {
    const navigate = vi.fn();
    const escapes = vi.fn();
    document.addEventListener('keydown', escapes);
    const stop = interceptInternalLinks(navigate);
    document.body.innerHTML = '<div class="fleet-panel"><a class="fleet-row" href="/stats">Stats</a></div>';
    const ev = click(document.querySelector('a'));
    expect(ev).toBe(false); // default prevented
    expect(navigate).toHaveBeenCalledWith('/stats');
    expect(escapes.mock.calls[0][0].key).toBe('Escape');
    stop();
    document.removeEventListener('keydown', escapes);
  });
  it('leaves /api/*, other origins, new-tab and modified clicks alone', () => {
    const navigate = vi.fn();
    const stop = interceptInternalLinks(navigate);
    document.body.innerHTML = '<a id="a" href="/api/auth/signin">x</a><a id="b" href="https://giftme.crystalprism.io/">y</a><a id="c" href="/plans" target="_blank">z</a><a id="d" href="/plans">w</a>';
    for (const id of ['a', 'b', 'c']) click(document.getElementById(id));
    click(document.getElementById('d'), { metaKey: true });
    expect(navigate).not.toHaveBeenCalled();
    stop();
  });
  it('leaves a data-reload anchor as a real page load', () => {
    const navigate = vi.fn();
    const stop = interceptInternalLinks(navigate);
    document.body.innerHTML = '<a id="t" href="." data-reload>Pause</a>';
    click(document.getElementById('t'));
    expect(navigate).not.toHaveBeenCalled();
    stop();
  });
});

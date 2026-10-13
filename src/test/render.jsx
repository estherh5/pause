import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App from '../App.jsx';

export const jsonResponse = (body, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Render the whole app at `route` with /api/me answering `me`. `routes` maps a
 *  path prefix to (path, init) => Response for any other API call; anything
 *  unmatched rejects (the fleet apps.json fetch falls back to its baked list). */
export function renderApp({ route = '/', me = { state: 'signed-out' }, routes = {} } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    if (path === '/api/me') return jsonResponse(me);
    if (path === '/api/auth/csrf') return jsonResponse({ csrfToken: 't' });
    const hit = Object.keys(routes).filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
    if (hit) return routes[hit](path, init);
    throw new Error(`unexpected fetch ${path}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, calls, client };
}

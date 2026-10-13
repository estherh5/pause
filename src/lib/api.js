// Same-origin Vercel functions (spec D5). There is no other API host any more.
export const API_BASE = '/api';

export class ApiError extends Error {
  constructor(status, code, message, body) {
    super(message || code || `Request failed with status ${status}`);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const code = data && typeof data === 'object' ? data.error : undefined;
    throw new ApiError(res.status, code, typeof data === 'string' ? data : code, data);
  }
  return data;
}

const enc = encodeURIComponent;
export const api = {
  me: () => request('/me'),
  listPlans: () => request('/plans'),
  getPlan: (id) => request(`/plans/${enc(id)}`),
  createPlan: (name, plan) => request('/plans', { method: 'POST', body: { name, plan } }),
  updatePlan: (id, patch) => request(`/plans/${enc(id)}`, { method: 'PATCH', body: patch }),
  deletePlan: (id) => request(`/plans/${enc(id)}`, { method: 'DELETE' }),
  resolveInvite: (token) => request(`/access?resource=invites&token=${enc(token)}`),
  // A refused accept (403 mismatch/invalid) still carries its outcome body.
  acceptInvite: (token) =>
    request('/access?resource=invites&action=accept', { method: 'POST', body: { token } }).catch((e) => {
      if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'ok' in e.body) return e.body;
      throw e;
    }),
  stats: (tz) => request(`/stats?tz=${enc(tz)}`),
};

import type { VercelRequest, VercelResponse } from './vercel.js';

// Server half of flare for Vercel functions: a port of
// flare/reporters/node/flare-report.mjs's transport, same wire format, same
// three no-op gates (key, endpoint, production). Never throws.
const TIMEOUT_MS = 2_000;

/** Drizzle's query errors embed the bound params ("Failed query: ...\nparams: a@b.com"),
 *  which are people's emails and plan names. Keep the query text, drop everything from params on. */
export function sanitizeForFlare(text: string): string {
  const i = text.indexOf('\nparams:');
  return i < 0 ? text : text.slice(0, i);
}

export function flareServerEnabled(): boolean {
  return Boolean(process.env.FLARE_URL) && Boolean(process.env.FLARE_KEY) && process.env.VERCEL_ENV === 'production';
}

export async function reportServerError(err: unknown, path: string): Promise<void> {
  if (!flareServerEnabled()) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    await fetch(process.env.FLARE_URL as string, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-flare-key': process.env.FLARE_KEY as string },
      body: JSON.stringify({
        events: [{
          kind: 'server', name: e.name || 'Error', message: sanitizeForFlare(e.message) || 'Unknown error', stack: e.stack ? sanitizeForFlare(e.stack) : null,
          url: path, release: process.env.VERCEL_GIT_COMMIT_SHA ?? null, environment: 'production',
          occurredAt: Date.now(), context: null,
        }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Reporting must never break the response.
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

export function withFlare(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      await reportServerError(err, (req.url ?? '').split('?')[0]);
      if (!(res as unknown as { headersSent: boolean }).headersSent) res.status(500).json({ error: 'server-error' });
    }
  };
}

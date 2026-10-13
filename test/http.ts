import type { VercelRequest, VercelResponse } from '../lib/vercel.js';

export interface CallResult {
  status: number;
  body: unknown;          // parsed JSON, or the string passed to send()
  headers: Record<string, string>;
  ended: boolean;
}

/** Drive a Vercel (req, res) handler in-process and record what it did. */
export async function callHandler(
  handler: (req: VercelRequest, res: VercelResponse) => unknown,
  opts: { method: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string>; url?: string },
): Promise<CallResult> {
  const out: CallResult = { status: 200, body: undefined, headers: {}, ended: false };
  const req = {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: opts.headers ?? {},
    url: opts.url ?? '/',
    cookies: {},
  } as unknown as VercelRequest;
  const res = {
    headersSent: false,
    status(code: number) { out.status = code; return res; },
    json(v: unknown) { out.body = v; out.ended = true; res.headersSent = true; return res; },
    send(v: unknown) { out.body = v; out.ended = true; res.headersSent = true; return res; },
    end() { out.ended = true; res.headersSent = true; return res; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; return res; },
  } as unknown as VercelResponse & { headersSent: boolean };
  await handler(req, res);
  return out;
}

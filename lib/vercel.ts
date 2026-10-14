import type { IncomingMessage, ServerResponse } from 'node:http';

// The request/response shapes Vercel's Node runtime hands every api/ function,
// copied from @vercel/node's index.d.ts. That package was only ever imported
// for these two types, and even its latest major pins vulnerable undici and
// path-to-regexp; Vercel's builder supplies its own runtime, so the app does
// not need the package installed at all. The `any`s are kept as upstream wrote them.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type VercelRequest = IncomingMessage & {
  query: { [key: string]: string | string[] };
  cookies: { [key: string]: string };
  body: any;
};

export type VercelResponse = ServerResponse & {
  send: (body: any) => VercelResponse;
  json: (jsonBody: any) => VercelResponse;
  status: (statusCode: number) => VercelResponse;
  redirect: (statusOrUrl: string | number, url?: string) => VercelResponse;
};

import { Auth, type AuthConfig } from '@auth/core';
import Google from '@auth/core/providers/google';
import { sessionCookieConfig } from '../../lib/session-cookie.js';
import { stampSignIn } from '../../lib/ring-session-check.js';
import { reportServerError } from '../../lib/flare-server.js';

// Web-standard Vercel function: @auth/core's Auth() is a Fetch handler
// (Request -> Response), so we expose GET/POST directly rather than the
// raw (req, res) node signature the rest of api/ uses.
export const config = { runtime: 'nodejs' };

/**
 * Exported so test/auth-callbacks.test.ts can call the gate directly. It used
 * to be an object literal buried inside `authConfig`, where no test could
 * reach it, and the gate itself is a single `return` — so the whole suite
 * stayed green with the body replaced by `return true`.
 *
 * `satisfies`, NEVER a type annotation. `AuthConfig['callbacks']` declares
 * every member optional, so annotating would widen `signIn` to
 * `… | undefined` and the test would be exercising a `?.` rather than the
 * gate.
 */
export const callbacks = {
  // The email->identity mapping inherits access by email, so only trust
  // Google accounts whose email Google has verified.
  signIn({ account, profile }) {
    if (account?.provider === 'google') {
      return (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
    }
    return true;
  },
  // Stamp the ring-global sign-in claims (see lib/ring-session-check.ts). Only
  // on the sign-in branch: every ring app reads a missing `signedInAt` as 0,
  // so without this a pause sign-in is revoked by the next ring app it
  // visits once the account has ever reset its password.
  jwt({ token, user }) {
    if (user?.email) stampSignIn(token, Date.now());
    return token;
  },
} satisfies AuthConfig['callbacks'];

export const authConfig: AuthConfig = {
  basePath: '/api/auth',
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  // Share the ring cookie so a session minted here is readable by every
  // crystalprism.io app (and vice-versa).
  cookies: { sessionToken: sessionCookieConfig(process.env) },
  callbacks,
};

// `Auth(request, authConfig)` — the WHOLE object, never
// `{ ...authConfig, callbacks: … }`. A spread here would leave `authConfig`
// itself pristine, so `expect(authConfig.callbacks).toBe(callbacks)` cannot
// see it; only an assertion about what Auth() was actually handed can. That is
// measured in test/auth-callbacks.test.ts, not assumed.
// Spec D14: flare wraps every api handler. withFlare() is (req, res); this one
// is a Fetch handler, so it reports and rethrows (Vercel still answers 500).
async function reported(request: Request): Promise<Response> {
  try {
    return await Auth(request, authConfig);
  } catch (err) {
    await reportServerError(err, new URL(request.url).pathname);
    throw err;
  }
}

export function GET(request: Request): Promise<Response> {
  return reported(request);
}

export function POST(request: Request): Promise<Response> {
  return reported(request);
}

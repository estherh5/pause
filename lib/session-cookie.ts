/** Session cookie shared across the crystalprism.io SSO ring (giftme, nexus, pause,
 *  space). Auth.js derives the JWT key from HKDF(AUTH_SECRET, cookie name),
 *  so every app must use this exact name for tokens to be mutually readable.
 *  Pure and edge-safe: no imports, safe for auth.config.ts / middleware. */
export function sessionCookieConfig(env: { NODE_ENV?: string; VERCEL_ENV?: string }) {
  const secure = env.NODE_ENV === "production";
  // Only real production gets the shared parent domain; preview deploys keep
  // a host-only cookie so they can't poison the ring.
  const domain = env.VERCEL_ENV === "production" ? ".crystalprism.io" : undefined;
  return {
    name: `${secure ? "__Secure-" : ""}crystalprism.session-token`,
    options: {
      httpOnly: true as const,
      sameSite: "lax" as const,
      path: "/",
      secure,
      ...(domain ? { domain } : {}),
    },
  };
}

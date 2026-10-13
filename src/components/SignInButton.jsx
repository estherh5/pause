import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

/** POST straight to Google with the Auth.js CSRF token, skipping Auth.js's own page. */
export default function SignInButton({ next = '/' }) {
  const [csrfToken, setCsrfToken] = useState(null);
  useEffect(() => {
    fetch('/api/auth/csrf').then((r) => r.json()).then((d) => setCsrfToken(d.csrfToken)).catch(() => setCsrfToken(''));
  }, []);
  return (
    <form method="POST" action="/api/auth/signin/google">
      <input type="hidden" name="csrfToken" value={csrfToken ?? ''} />
      <input type="hidden" name="callbackUrl" value={next} />
      <button type="submit" className="pause-button" disabled={csrfToken === null}>Sign in with Google</button>
    </form>
  );
}
SignInButton.propTypes = { next: PropTypes.string };

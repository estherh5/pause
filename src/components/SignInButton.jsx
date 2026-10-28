import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

/** POST straight to Google with the Auth.js CSRF token, skipping Auth.js's own page.
 *  The token fetch is the button's own slot: it reads "Getting ready…" while the
 *  token loads and becomes a Try again if it fails, because a submit without a
 *  token lands on Auth.js's MissingCSRF error page. */
export default function SignInButton({ next = '/' }) {
  const [csrfToken, setCsrfToken] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let live = true;
    fetch('/api/auth/csrf')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`csrf ${r.status}`))))
      .then((d) => {
        if (!live) return;
        if (typeof d?.csrfToken === 'string' && d.csrfToken) setCsrfToken(d.csrfToken);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [attempt]);

  if (failed) {
    return (
      <div className="pause-access">
        <p role="alert" className="pause-error">Couldn&apos;t reach sign-in.</p>
        <button type="button" className="pause-quiet" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</button>
      </div>
    );
  }
  const ready = csrfToken !== null;
  return (
    <form method="POST" action="/api/auth/signin/google" onSubmit={() => setSubmitting(true)}>
      <input type="hidden" name="csrfToken" value={csrfToken ?? ''} />
      <input type="hidden" name="callbackUrl" value={next} />
      <button type="submit" className="pause-button" disabled={!ready || submitting} aria-busy={!ready || submitting}>
        {!ready ? 'Getting ready…' : submitting ? 'Opening Google…' : 'Sign in with Google'}
      </button>
    </form>
  );
}
SignInButton.propTypes = { next: PropTypes.string };

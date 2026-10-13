import PropTypes from 'prop-types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import SignInButton from '../components/SignInButton.jsx';
import { api } from '../lib/api.js';
import './AuthPages.css';

const Shell = ({ children }) => (
  <main className="pause-auth">
    <h1 className="pause-auth-title">Pause</h1>
    {children}
  </main>
);
Shell.propTypes = { children: PropTypes.node };

/** Every dead link says exactly this, whatever killed it. */
const Invalid = () => (
  <Shell>
    <p>This invitation link doesn&apos;t work. Ask for a new one.</p>
  </Shell>
);

export default function InvitePage({ me }) {
  const { token } = useParams();
  const queryClient = useQueryClient();
  const [resolved, setResolved] = useState(null);
  const view = resolved?.token === token ? resolved.view : null;
  const [outcome, setOutcome] = useState(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let live = true;
    api.resolveInvite(token)
      .then((view) => live && setResolved({ token, view }))
      .catch(() => live && setResolved({ token, view: { state: 'invalid' } }));
    return () => { live = false; };
  }, [token]);

  if (!view || !me) return <Shell><p role="status" className="pause-muted">Opening the invitation</p></Shell>;
  if (view.state !== 'valid') return <Invalid />;

  if (outcome?.ok) {
    return (
      <Shell>
        <p>You&apos;re in. Your saved plans live in My plans.</p>
        <a className="pause-button pause-auth-cta" href="/plans">My plans</a>
      </Shell>
    );
  }
  if (outcome?.reason === 'mismatch') {
    return (
      <Shell>
        <p>This invitation is for a different account.</p>
        <p className="pause-muted">It was sent to {outcome.invited}. You are signed in as {me.email}.</p>
      </Shell>
    );
  }
  if (outcome) return <Invalid />;

  const accept = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    api.acceptInvite(token)
      .then((o) => {
        setOutcome(o);
        if (o.ok) queryClient.invalidateQueries({ queryKey: ['me'] });
      })
      .catch(() => setOutcome({ ok: false, reason: 'invalid' }))
      .finally(() => { inFlight.current = false; setPending(false); });
  };

  return (
    <Shell>
      <p>{`${view.invitedBy} invited ${view.maskedEmail} to save plans in Pause.`}</p>
      {view.note && <p className="pause-muted">{view.note}</p>}
      {me.state === 'signed-out' ? (
        <SignInButton next={`/invite/${token}`} />
      ) : (
        <button type="button" className="pause-button" aria-disabled={pending} onClick={accept}>Accept</button>
      )}
    </Shell>
  );
}
InvitePage.propTypes = { me: PropTypes.shape({ state: PropTypes.string, email: PropTypes.string }) };

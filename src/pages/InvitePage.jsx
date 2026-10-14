import PropTypes from 'prop-types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import SignInButton from '../components/SignInButton.jsx';
import { ApiError, api } from '../lib/api.js';
import { useMe } from '../lib/queries.js';
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
  // Why the last Accept didn't land: 'expired' (401) or 'unreachable' (network/5xx).
  const [acceptFailure, setAcceptFailure] = useState(null);
  const inFlight = useRef(false);
  // Same ['me'] query App reads, so this adds no fetch; App only passes the data.
  const { isError: meFailed, refetch: retryMe, isFetching: meFetching } = useMe();

  useEffect(() => {
    let live = true;
    api.resolveInvite(token)
      .then((view) => live && setResolved({ token, view }))
      .catch(() => live && setResolved({ token, view: { state: 'invalid' } }));
    return () => { live = false; };
  }, [token]);

  if (!me && meFailed) {
    return (
      <Shell>
        <p role="alert" className="pause-error">Couldn&apos;t reach Pause.</p>
        <button type="button" className="pause-button" aria-disabled={meFetching} onClick={() => !meFetching && retryMe()}>Try again</button>
      </Shell>
    );
  }
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
    setAcceptFailure(null);
    api.acceptInvite(token)
      .then((o) => {
        setOutcome(o);
        if (o.ok) queryClient.invalidateQueries({ queryKey: ['me'] });
      })
      // Only an outcome the server states makes the link dead; anything else is retryable.
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          setAcceptFailure('expired');
          queryClient.invalidateQueries({ queryKey: ['me'] });
        } else {
          setAcceptFailure('unreachable');
        }
      })
      .finally(() => { inFlight.current = false; setPending(false); });
  };

  return (
    <Shell>
      <p>{`${view.invitedBy} invited ${view.maskedEmail} to save plans in Pause.`}</p>
      {view.note && <p className="pause-muted">{view.note}</p>}
      {acceptFailure && (
        <p role="alert" className="pause-error">
          {acceptFailure === 'expired' ? 'Your sign-in expired. Sign in again to accept.' : "Couldn't reach Pause. Try again."}
        </p>
      )}
      {me.state === 'signed-out' || acceptFailure === 'expired' ? (
        <SignInButton next={`/invite/${token}`} />
      ) : (
        <button type="button" className="pause-button" aria-disabled={pending} onClick={accept}>Accept</button>
      )}
    </Shell>
  );
}
InvitePage.propTypes = { me: PropTypes.shape({ state: PropTypes.string, email: PropTypes.string }) };

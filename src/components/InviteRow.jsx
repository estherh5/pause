import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { INVITE_STATUSES } from '../../lib/invite-status.ts';
import './admin.css';

// A tap arms the control, a second tap within the window confirms it.
// ARM_MIN_MS stops a double-click or a held Enter from satisfying "two taps"
// with one gesture.
const ARM_MS = 4000;
const ARM_MIN_MS = 350;

/** Admission is read from the database on every request (spec 3), so Remove
 *  bites on the person's next request. If that changes, both sentences must too. */
const REMOVE_COPY = 'They lose saved plans right away. Their plans stay, and Restore brings them back.';
const REMOVE_DONE = "Removed. They can't open saved plans anymore. Their plans are kept, and Restore brings them back.";

/** The server answers with codes ('not found', 'revoked', 'unauthorized',
 *  'forbidden'), never sentences, so the row says what to do by status. */
function errorText(err) {
  switch (err?.status) {
    case undefined: return "That didn't go through. Check your connection and try again.";
    case 401: return 'You were signed out. Sign in again, then retry.';
    case 403: return 'Only the owner can change invitations.';
    case 404: return 'This invitation is gone. Reload the page to see the current list.';
    case 409: return 'This invitation was revoked. Restore it first, then resend.';
    default: return "Something went wrong on Pause's side. Try again in a minute.";
  }
}

/** Keyed by the server's `statusOf` union (lib/invite-status.ts). */
const STATUS_LABEL = { invited: 'Invited', accepted: 'Accepted', expired: 'Expired', revoked: 'Revoked', removed: 'Removed' };
const when = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * One invitation in the owner's list (DESIGN.md "Removing a member").
 *  - invited / expired: Resend, Revoke (two taps)
 *  - accepted: Remove, never "Revoke": removing a person is a different act
 *    from cancelling an unused invitation, and the label says which
 *  - revoked (never accepted) / removed (was a member): Restore only
 * A successful action changes the status, which swaps the control set and would
 * drop keyboard focus to <body>; focus moves to the row's first enabled control.
 */
export default function InviteRow({ inv }) {
  const queryClient = useQueryClient();
  const [busyKind, setBusyKind] = useState(null);
  const [done, setDone] = useState(null); // { kind, text } | null
  const [error, setError] = useState('');
  const [armedAt, setArmedAt] = useState(null);
  const acts = useRef(null);
  const refocusFrom = useRef(null);
  const inFlight = useRef(false);
  const armed = armedAt !== null;
  const busy = busyKind !== null;
  const shown = inv.status;

  useEffect(() => {
    if (armedAt === null) return undefined;
    const t = setTimeout(() => setArmedAt(null), ARM_MS);
    return () => clearTimeout(t);
  }, [armedAt]);

  // Keyed on the STATUS changing, not on `busy` clearing: the request can settle
  // a commit before the refreshed row arrives, and focusing then lands on the
  // old button that refresh is about to unmount. Focus is taken back only from
  // <body> or this row's own actions box, never from somewhere the owner went.
  useEffect(() => {
    if (refocusFrom.current === null || refocusFrom.current === shown || busy) return;
    refocusFrom.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && !acts.current?.contains(active)) return;
    acts.current?.querySelector('button:not([disabled])')?.focus();
  }, [shown, busy]);

  async function run(kind, action, doneText) {
    if (inFlight.current) return;
    inFlight.current = true;
    const from = shown;
    setBusyKind(kind);
    setDone(null);
    setError('');
    try {
      await action();
      setDone({ kind, text: doneText });
      refocusFrom.current = from;
      await queryClient.invalidateQueries({ queryKey: ['invites'] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      inFlight.current = false;
      setBusyKind(null);
    }
  }

  function armedPress(kind, doneText) {
    if (armedAt === null) { setArmedAt(Date.now()); return; }
    if (Date.now() - armedAt < ARM_MIN_MS) return; // too fast to be a second decision
    setArmedAt(null);
    run(kind, () => api.revokeInvite(inv.id), doneText);
  }

  const removed = inv.status === 'removed';
  const restorable = inv.status === 'revoked' || removed;
  const removable = inv.status === 'accepted';
  const resendable = inv.status === 'invited' || inv.status === 'expired';
  const label = STATUS_LABEL[inv.status];
  const warn = resendable && (inv.emailStatus === 'failed' || inv.emailStatus === 'skipped');

  return (
    <li className="invite-row">
      <div className="invite-head">
        <span className="invite-email">{inv.email}</span>
        <span className={`invite-pill invite-pill-${inv.status}`}>{label}</span>
      </div>
      <p className="invite-meta pause-muted">
        {inv.status === 'accepted' && inv.acceptedAt != null && `Joined ${when(inv.acceptedAt)}`}
        {resendable && `Sent ${when(inv.createdAt)}${inv.status === 'invited' ? ` · Expires ${when(inv.expiresAt)}` : ''}`}
        {restorable && `${label} ${when(inv.revokedAt ?? inv.createdAt)}`}
      </p>
      {inv.note && <p className="invite-note">{inv.note}</p>}
      {warn && (
        <p className="pause-error invite-meta">
          {inv.emailStatus === 'skipped'
            ? 'Email is not configured. Send them the link another way, or resend once it is.'
            : 'The email did not go out, but the invitation stands. Press Resend.'}
        </p>
      )}
      <div className="invite-actions" ref={acts}>
        {resendable && (
          <button type="button" className="pause-quiet" disabled={busy}
            onClick={() => run('resend', () => api.resendInvite(inv.id), `Resent to ${inv.email}.`)}>
            {busyKind === 'resend' ? 'Sending…' : 'Resend'}
          </button>
        )}
        {resendable && (
          <button type="button" className={`pause-quiet invite-danger${armed ? ' is-armed' : ''}`} disabled={busy}
            onClick={() => armedPress('revoke', 'Revoked.')}>
            {busyKind === 'revoke' ? 'Revoking…' : armed ? 'Really revoke?' : 'Revoke'}
          </button>
        )}
        {removable && (
          <button type="button" className={`pause-quiet invite-danger${armed ? ' is-armed' : ''}`} disabled={busy}
            onClick={() => armedPress('remove', REMOVE_DONE)}>
            {busyKind === 'remove' ? 'Removing…' : armed ? 'Really remove?' : 'Remove'}
          </button>
        )}
        {restorable && (
          <button type="button" className="pause-quiet" disabled={busy}
            onClick={() => run('restore', () => api.restoreInvite(inv.id), 'Restored.')}>
            {busyKind === 'restore' ? 'Restoring…' : 'Restore'}
          </button>
        )}
      </div>
      {/* Mounted with the row, only its content changes, so the consequence is
          announced the moment Remove arms. */}
      <div role="status">
        {armed && removable && <p className="invite-meta">{REMOVE_COPY}</p>}
        {done && <p className="invite-meta">{done.text}</p>}
      </div>
      {error && <p role="alert" className="pause-error invite-meta">{error}</p>}
    </li>
  );
}

InviteRow.propTypes = {
  inv: PropTypes.shape({
    id: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    note: PropTypes.string,
    status: PropTypes.oneOf(INVITE_STATUSES).isRequired,
    emailStatus: PropTypes.string,
    createdAt: PropTypes.number,
    expiresAt: PropTypes.number,
    acceptedAt: PropTypes.number,
    revokedAt: PropTypes.number,
  }).isRequired,
};

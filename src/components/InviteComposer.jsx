import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api.js';
import DraftNotice from './DraftNotice';
import { useFormDraft } from './useFormDraft';
import './admin.css';

/** The sending half of invitations (DESIGN.md "Invitations"): email + optional
 *  note. The server validates the address and answers with its own sentence. */
export default function InviteComposer() {
  const queryClient = useQueryClient();
  const draft = useFormDraft({ scope: 'invite:new', mode: 'restore' });
  const [email, setEmail] = draft.field('email', '');
  const [note, setNote] = draft.field('note', '');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null); // { ok, text } | null
  const inFlight = useRef(false);

  async function submit(e) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setResult(null);
    const to = email.trim();
    try {
      const row = await api.createInvite(to, note);
      draft.clear();
      setEmail('');
      setNote('');
      setResult({
        ok: true,
        text: row?.emailStatus === 'sent' || !row?.emailStatus
          ? `Invitation sent to ${to}.`
          : `${to} is invited, but the email didn't go out. Press Resend on their row.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['invites'] });
    } catch (err) {
      let text = "The invitation didn't send. Check your connection and try again.";
      if (err instanceof ApiError && err.code === 'already-member') text = `${to} is already a member.`;
      else if (err instanceof ApiError && err.status === 400 && err.code) text = err.code;
      setResult({ ok: false, text });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form className="invite-composer" noValidate onSubmit={submit} aria-busy={pending ? 'true' : 'false'}>
      <DraftNotice draft={draft.state} onRestore={draft.restore} onDiscard={draft.discard} />
      <label className="pause-field-label" htmlFor="invite-email">Email</label>
      <input
        id="invite-email"
        name="email"
        type="email"
        className="pause-field"
        autoComplete="off"
        placeholder="friend@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="pause-field-label invite-note-label" htmlFor="invite-note">Note (optional)</label>
      <textarea
        id="invite-note"
        name="note"
        className="pause-field pause-textarea"
        rows={3}
        maxLength={1000}
        placeholder="A personal note included in the email"
        aria-describedby="invite-note-hint"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <p id="invite-note-hint" className="pause-muted invite-hint">Anyone with the invite link can read this note.</p>
      <div role="status">{result?.ok && <p>{result.text}</p>}</div>
      {result && !result.ok && <p role="alert" className="pause-error">{result.text}</p>}
      <button type="submit" className="pause-button" disabled={pending}>
        {pending ? 'Sending…' : 'Send invitation'}
      </button>
    </form>
  );
}

import PropTypes from 'prop-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api.js';
import { TYPE_LABEL, TYPE_OPTIONS, STATUS_LABEL } from '../lib/feedback-labels.js';
import { SelectMenu } from './SelectMenu';
import DraftNotice from './DraftNotice';
import { useFormDraft } from './useFormDraft';
import FeedbackThread from './FeedbackThread.jsx';
import './admin.css';

/** Fleet-standard feedback loop: a fixed bottom-left button and a small native
 *  dialog with two tabs, send a new note or review your own threads read-only. */
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  // Bumped each open so the dialog (and its form) mounts fresh: a second note
  // in one session never meets a stale success or error line.
  const [instance, setInstance] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        className="pause-quiet pause-feedback-fab"
        aria-label="Send feedback"
        onClick={() => { setInstance((n) => n + 1); setOpen(true); }}
      >
        Feedback
      </button>
      {open && <FeedbackDialog key={instance} onClose={close} />}
    </>
  );
}

function FeedbackDialog({ onClose }) {
  const dialogRef = useRef(null);
  const [tab, setTab] = useState('send');
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={dialogRef} className="pause-dialog pause-feedback-dialog" aria-labelledby="feedback-title" onClose={onClose}>
      <h2 id="feedback-title" className="pause-dialog-title">{tab === 'send' ? 'Send feedback' : 'My submissions'}</h2>
      <div className="fb-tabs" role="tablist">
        {[['send', 'Send feedback'], ['mine', 'My submissions']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`fb-tab${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'send' ? <FeedbackForm onClose={onClose} /> : <MySubmissions onClose={onClose} />}
    </dialog>
  );
}
FeedbackDialog.propTypes = { onClose: PropTypes.func.isRequired };

function FeedbackForm({ onClose }) {
  const queryClient = useQueryClient();
  const draft = useFormDraft({ scope: 'feedback:new', mode: 'restore' });
  const [message, setMessage] = draft.field('message', '');
  const [type, setType] = useState('bug');
  const [notify, setNotify] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  // State lags a double click by one render; the ref does not.
  const inFlight = useRef(false);

  // Linger on the thank-you line, then close.
  useEffect(() => {
    if (!sent) return undefined;
    const t = setTimeout(onClose, 1500);
    return () => clearTimeout(t);
  }, [sent, onClose]);

  async function submit(e) {
    e.preventDefault();
    if (inFlight.current || !message.trim()) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    try {
      await api.createFeedback({ type, message, notify, pageUrl: window.location.href });
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ['my-feedback'] });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 && err.code
        ? err.code
        : "Your note didn't send. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  if (sent) return <p className="pause-dialog-body" role="status">Thanks. Your note was sent.</p>;

  return (
    <form onSubmit={submit} aria-busy={sending ? 'true' : 'false'}>
      <DraftNotice draft={draft.state} onRestore={draft.restore} onDiscard={draft.discard} />
      <span className="pause-field-label" id="fb-type-label">Type</span>
      <div className="pause-form-gap">
        <SelectMenu
          id="fb-type"
          name="type"
          className="selectbox pause-selectbox"
          ariaLabelledBy="fb-type-label"
          placeholder="Choose a type"
          value={type}
          options={TYPE_OPTIONS}
          onChange={setType}
          disabled={sending}
        />
      </div>
      <label className="pause-field-label" htmlFor="fb-message">Message</label>
      <textarea
        id="fb-message"
        name="message"
        className="pause-field pause-textarea"
        rows={5}
        maxLength={5000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What's on your mind?"
      />
      <label className="pause-check">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        <span>Email me when it&apos;s addressed</span>
      </label>
      {error && <p role="alert" className="pause-error">{error}</p>}
      <div className="pause-dialog-actions">
        <button type="button" className="pause-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" className="pause-button" disabled={sending || !message.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
FeedbackForm.propTypes = { onClose: PropTypes.func.isRequired };

function MySubmissions({ onClose }) {
  const { data: items, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: ['my-feedback'], queryFn: api.listFeedback });
  const [openIds, setOpenIds] = useState(() => new Set());

  function toggle(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  let body;
  if (isLoading) body = <p className="pause-muted">Loading…</p>;
  else if (isError) body = (
    <div className="pause-access">
      <p role="alert" className="pause-error">Couldn&apos;t load your feedback.</p>
      <button type="button" className="pause-quiet" aria-disabled={isFetching} onClick={() => !isFetching && refetch()}>{isFetching ? 'Trying…' : 'Try again'}</button>
    </div>
  );
  else if (!items || items.length === 0) body = <p className="pause-muted">Anything you send shows up here, along with the reply.</p>;
  else {
    body = (
      <ul className="fb-list">
        {items.map((item) => {
          const isOpen = openIds.has(item.id);
          return (
            <li key={item.id} className="fb-item">
              <button type="button" className="fb-item-toggle" aria-expanded={isOpen} onClick={() => toggle(item.id)}>
                <span className="fb-item-type">{TYPE_LABEL[item.type] ?? 'Other'}</span>
                <span className={`fb-badge status-${item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                <span className="fb-chevron" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
              </button>
              {isOpen && (
                <FeedbackThread
                  head={{ body: item.message, createdAt: item.createdAt, authorLabel: 'You' }}
                  messages={item.messages ?? []}
                  showEmailStatus={false}
                />
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <>
      {body}
      <div className="pause-dialog-actions">
        <button type="button" className="pause-quiet" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
MySubmissions.propTypes = { onClose: PropTypes.func.isRequired };

import PropTypes from 'prop-types';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BackLink from '../components/BackLink.jsx';
import FeedbackThread from '../components/FeedbackThread.jsx';
import { SelectMenu } from '../components/SelectMenu';
import DraftNotice from '../components/DraftNotice';
import { useFormDraft } from '../components/useFormDraft';
import OwnerGate from '../components/OwnerGate.jsx';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { TYPE_LABEL, STATUSES } from '../lib/feedback-labels.js';
import '../components/admin.css';

function FeedbackRow({ item }) {
  const queryClient = useQueryClient();
  const draft = useFormDraft({ scope: `feedback:reply:${item.id}`, mode: 'restore' });
  const [reply, setReply] = draft.field('reply', '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['feedback-all'] });

  // The status is a server value. Hold it locally so the trigger updates the
  // instant it's picked, but resync during render whenever the row changes:
  // useState(item.status) alone goes stale after a save and revalidate, and the
  // next save would post the status the row had when it first mounted.
  const [status, setStatus] = useState(item.status);
  const [serverStatus, setServerStatus] = useState(item.status);
  if (serverStatus !== item.status) {
    setServerStatus(item.status);
    setStatus(item.status);
  }

  async function changeStatus(next) {
    setStatus(next);
    setSavingStatus(true);
    setError('');
    try {
      await api.setFeedbackStatus(item.id, next);
      await refresh();
    } catch {
      setStatus(item.status);
      setError("The status didn't save. Try again.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function sendReply() {
    if (sending || !reply.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.replyFeedback(item.id, reply);
      draft.clear();
      setReply('');
      await refresh();
    } catch (err) {
      setError(err?.status === 400 && err.code ? err.code : "The reply didn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <li className="fb-admin-row">
      <div className="fb-admin-head">
        <span>{TYPE_LABEL[item.type] ?? 'Other'} · {item.userEmail}</span>
        <span className="pause-muted">{formatDate(item.createdAt)}</span>
      </div>
      {item.pageUrl && <p className="pause-muted fb-admin-page">Page: {item.pageUrl}</p>}
      <FeedbackThread
        head={{ body: item.message, createdAt: item.createdAt, authorLabel: item.userEmail }}
        messages={item.messages ?? []}
        showEmailStatus
      />
      <span className="pause-field-label" id={`st-${item.id}-label`}>Status</span>
      <div className="pause-form-gap">
        <SelectMenu
          id={`st-${item.id}`}
          name="status"
          className="selectbox pause-selectbox"
          ariaLabelledBy={`st-${item.id}-label`}
          placeholder="Status"
          value={status}
          options={STATUSES}
          disabled={savingStatus}
          onChange={changeStatus}
        />
      </div>
      <DraftNotice draft={draft.state} onRestore={draft.restore} onDiscard={draft.discard} />
      <label className="pause-field-label" htmlFor={`re-${item.id}`}>Reply</label>
      <textarea
        id={`re-${item.id}`}
        className="pause-field pause-textarea"
        rows={3}
        maxLength={5000}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Emails them if they asked to be told."
      />
      {error && <p role="alert" className="pause-error">{error}</p>}
      <button type="button" className="pause-button fb-reply-send" disabled={sending || !reply.trim()} onClick={sendReply}>
        {sending ? 'Sending…' : 'Send reply'}
      </button>
    </li>
  );
}
FeedbackRow.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string, status: PropTypes.string, type: PropTypes.string, userEmail: PropTypes.string,
    createdAt: PropTypes.string, pageUrl: PropTypes.string, message: PropTypes.string, messages: PropTypes.array,
  }).isRequired,
};

function Inbox() {
  const { data: items, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: ['feedback-all'], queryFn: api.listAllFeedback });
  return (
    <>
      <p><a className="pause-link pause-tap" href="/settings">Settings</a></p>
      {isLoading && <div className="pause-skeleton" aria-hidden="true" />}
      {isError && (
        <div className="pause-access">
          <p className="pause-error">Couldn&apos;t load feedback.</p>
          <button type="button" className="pause-quiet" aria-disabled={isFetching} onClick={() => !isFetching && refetch()}>{isFetching ? 'Trying…' : 'Try again'}</button>
        </div>
      )}
      {items && items.length === 0 && <p className="pause-muted">No feedback yet.</p>}
      {items && items.length > 0 && <ul className="fb-admin-list">{items.map((item) => <FeedbackRow key={item.id} item={item} />)}</ul>}
    </>
  );
}

export default function AdminFeedbackPage({ me }) {
  return (
    <main className="pause-page">
      <BackLink />
      <h1 className="pause-page-title">Feedback</h1>
      <OwnerGate me={me} next="/admin/feedback"><Inbox /></OwnerGate>
    </main>
  );
}
AdminFeedbackPage.propTypes = { me: PropTypes.shape({ state: PropTypes.string }) };

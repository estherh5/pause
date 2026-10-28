import PropTypes from 'prop-types';
import Linkify from './Linkify.jsx';
import { formatDateTime } from '../lib/format.js';

function emailMarkFor(status) {
  if (status === 'sent') return { text: '✓ Sent', className: '' };
  if (status === 'failed') return { text: '✗ Failed', className: 'failed' };
  if (status === 'skipped') return { text: '— Skipped', className: '' };
  // Sent before Pause recorded email delivery, so there is nothing to show.
  return { text: 'Not recorded', className: 'pretracking' };
}

function Bubble({ side, label, body, createdAt, mark, viaEmail }) {
  return (
    <div className={`fb-bubble ${side}`}>
      {label && <span className="fb-bubble-label">{label}</span>}
      <p className="fb-bubble-body">
        <Linkify text={body} />
      </p>
      <div className="fb-bubble-meta">
        <span>{formatDateTime(createdAt)}</span>
        {viaEmail && <span className="fb-via-email">via email</span>}
        {mark && <span className={`fb-email-status ${mark.className}`}>{mark.text}</span>}
      </div>
    </div>
  );
}
Bubble.propTypes = {
  side: PropTypes.oneOf(['admin', 'user']).isRequired,
  label: PropTypes.string,
  body: PropTypes.string.isRequired,
  createdAt: PropTypes.string,
  mark: PropTypes.shape({ text: PropTypes.string, className: PropTypes.string }),
  viaEmail: PropTypes.bool,
};

/**
 * Renders a feedback conversation: the original submission as a head bubble,
 * then every reply in order. Shared between the admin triage row (with email
 * delivery marks) and the read-only "My submissions" widget tab (no marks).
 * A reply that arrived by email (channel 'email', api/inbound/feedback.ts)
 * carries a quiet "via email" mark in both.
 */
export default function FeedbackThread({ head, messages, showEmailStatus }) {
  return (
    <div className="fb-thread">
      <Bubble side="user" label={head.authorLabel} body={head.body} createdAt={head.createdAt} />
      {messages.map((m) => (
        <Bubble
          key={m.id}
          side={m.author === 'admin' ? 'admin' : 'user'}
          body={m.body}
          createdAt={m.createdAt}
          viaEmail={m.channel === 'email'}
          mark={showEmailStatus && m.author === 'admin' ? emailMarkFor(m.emailStatus ?? null) : null}
        />
      ))}
    </div>
  );
}
FeedbackThread.propTypes = {
  head: PropTypes.shape({ body: PropTypes.string, createdAt: PropTypes.string, authorLabel: PropTypes.string }).isRequired,
  messages: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, channel: PropTypes.oneOf(['web', 'email']) })).isRequired,
  showEmailStatus: PropTypes.bool.isRequired,
};

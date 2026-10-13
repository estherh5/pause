import PropTypes from 'prop-types';
import AccessNote from './AccessNote.jsx';

/** The owner-only gate shared by /settings and /admin/feedback. */
export default function OwnerGate({ me, next, children }) {
  let body = null;
  if (me?.state === 'owner') body = children;
  else if (me?.state === 'signed-out' || me?.state === 'guest') body = <AccessNote me={me} next={next} />;
  else if (me) body = <p className="pause-access">This page is for the owner.</p>;
  return body;
}
OwnerGate.propTypes = { me: PropTypes.shape({ state: PropTypes.string }), next: PropTypes.string, children: PropTypes.node };

import PropTypes from 'prop-types';
import SignInButton from './SignInButton.jsx';

/** The signed-out and guest sentences shared by /plans and /stats (spec §5.4). */
export default function AccessNote({ me, next }) {
  if (me?.state === 'signed-out') {
    return (
      <div className="pause-access">
        <p>Sign in to keep plans by name.</p>
        <SignInButton next={next} />
      </div>
    );
  }
  if (me?.state === 'guest') {
    return (
      <div className="pause-access">
        <p>{`Saved plans are by invitation. ${me.email} doesn't have one.`}</p>
        <a className="pause-link pause-tap" href="/">Plan without saving</a>
      </div>
    );
  }
  return null;
}
AccessNote.propTypes = { me: PropTypes.shape({ state: PropTypes.string, email: PropTypes.string }), next: PropTypes.string };

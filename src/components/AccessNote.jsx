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
  if (me?.state === 'guest') return <p className="pause-access">{`Saved plans are by invitation. ${me.email} doesn't have one.`}</p>;
  return null;
}
AccessNote.propTypes = { me: PropTypes.shape({ state: PropTypes.string, email: PropTypes.string }), next: PropTypes.string };

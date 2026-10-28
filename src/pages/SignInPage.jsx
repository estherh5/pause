import PropTypes from 'prop-types';
import { Navigate, useSearchParams } from 'react-router-dom';
import BackLink from '../components/BackLink.jsx';
import SignInButton from '../components/SignInButton.jsx';
import './AuthPages.css';

// Only same-site paths may be a callback; anything else becomes "/".
const safeNext = (v) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/');

export default function SignInPage({ me }) {
  const [params] = useSearchParams();
  if (me && me.state !== 'signed-out') return <Navigate to="/plans" replace />;
  return (
    <main className="pause-auth">
      <BackLink />
      <h1 className="pause-auth-title">Pause</h1>
      <p>Sign in to save plans by name.</p>
      <SignInButton next={safeNext(params.get('next'))} />
      <a className="pause-link pause-auth-privacy" href="/privacy">Privacy</a>
    </main>
  );
}
SignInPage.propTypes = { me: PropTypes.shape({ state: PropTypes.string }) };

import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import BackLink from '../components/BackLink.jsx';
import OwnerGate from '../components/OwnerGate.jsx';
import InviteComposer from '../components/InviteComposer.jsx';
import InviteRow from '../components/InviteRow.jsx';
import { api } from '../lib/api.js';
import '../components/admin.css';

function Invitations() {
  const { data: invites, isLoading, isError } = useQuery({ queryKey: ['invites'], queryFn: api.listInvites });
  return (
    <section aria-labelledby="invitations-title">
      <h2 id="invitations-title" className="pause-section-title">Invitations</h2>
      <p className="pause-muted">Saved plans are by invitation. They get a link, sign in with Google, and access starts when they accept it.</p>
      <InviteComposer />
      {isLoading && <div className="pause-skeleton" aria-hidden="true" />}
      {isError && <p className="pause-error">The invitations didn&apos;t load.</p>}
      {invites && invites.length === 0 && <p className="pause-muted">No invitations yet.</p>}
      {invites && invites.length > 0 && (
        <ul className="invite-list">
          {invites.map((inv) => <InviteRow key={inv.id} inv={inv} />)}
        </ul>
      )}
    </section>
  );
}

export default function SettingsPage({ me }) {
  return (
    <main className="pause-page">
      <BackLink />
      <h1 className="pause-page-title">Settings</h1>
      <OwnerGate me={me} next="/settings">
        <Invitations />
        <p className="pause-settings-link"><a className="pause-link pause-tap" href="/admin/feedback">Feedback inbox</a></p>
      </OwnerGate>
    </main>
  );
}
SettingsPage.propTypes = { me: PropTypes.shape({ state: PropTypes.string }) };

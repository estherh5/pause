import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { FleetMenu } from '../components/FleetMenu';
import { getFleetApps, shapeFleet } from '../lib/fleet';
import { signOut } from '../lib/auth.js';
import './Header.css';

// Rows by state (spec 5.1). `me` is null while /api/me is in flight: render the
// apps-only menu rather than flashing a Sign in row at a signed-in person.
function Header({ me }) {
  const [apps, setApps] = useState(() => shapeFleet(null, 'pause'));

  useEffect(() => {
    let live = true;
    getFleetApps('pause').then((list) => {
      if (live) setApps(list);
    });
    return () => {
      live = false;
    };
  }, []);

  const signedIn = Boolean(me) && me.state !== 'signed-out';
  const member = me?.state === 'member' || me?.state === 'owner';
  return (
    <header id="header">
      <FleetMenu
        apps={apps}
        user={signedIn ? { email: me.email } : null}
        settingsHref={me?.state === 'owner' ? '/settings' : null}
        statsHref={member ? '/stats' : null}
        signInHref={me?.state === 'signed-out' ? '/signin' : null}
        signOutAction={signedIn ? signOut : null}
        placement="down-end"
        triggerClassName="pause-fleet-trigger"
      />
    </header>
  );
}

Header.propTypes = {
  me: PropTypes.shape({ state: PropTypes.string, email: PropTypes.string, name: PropTypes.string }),
};

export default Header;

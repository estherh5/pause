import { useEffect, useState } from 'react';
import { FleetMenu } from '../components/FleetMenu';
import { getFleetApps, shapeFleet } from '../lib/fleet';
import './Header.css';

// Pause has no account, so the fleet menu is apps only: no user, no settings,
// no sign-in. The baked list renders at once; the hosted apps.json replaces it
// when it arrives (getFleetApps falls back to the same baked list on failure).
function Header() {
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

  return (
    <header id="header">
      <FleetMenu
        apps={apps}
        user={null}
        settingsHref={null}
        statsHref={null}
        signInHref={null}
        signOutAction={null}
        placement="down-end"
        triggerClassName="pause-fleet-trigger"
      />
    </header>
  );
}

export default Header;

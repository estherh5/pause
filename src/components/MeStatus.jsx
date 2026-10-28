import PropTypes from 'prop-types';
import { useMe } from '../lib/queries.js';

/** What a gated page shows before it knows who is signed in: a skeleton while
 *  /api/me is in flight, and a Try again once it has failed. Without it the
 *  page is a title over nothing, and stays that way if the request never lands. */
export default function MeStatus() {
  const { isError, isFetching, refetch } = useMe();
  if (isError) return <MeError retrying={isFetching} onRetry={refetch} />;
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => <div key={i} className="pause-skeleton pause-skeleton-row" />)}
    </div>
  );
}

/** The failed-/api/me sentence and its Try again, for a page that renders
 *  without knowing who is signed in (the planner) as well as the gated ones. */
export function MeError({ retrying = false, onRetry }) {
  return (
    <div className="pause-access">
      <p role="alert" className="pause-error">Couldn&apos;t reach Pause.</p>
      <button type="button" className="pause-quiet" aria-disabled={retrying} onClick={() => !retrying && onRetry()}>
        {retrying ? 'Trying…' : 'Try again'}
      </button>
    </div>
  );
}
MeError.propTypes = { retrying: PropTypes.bool, onRetry: PropTypes.func.isRequired };

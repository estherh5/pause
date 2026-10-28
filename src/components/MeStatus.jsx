import { useMe } from '../lib/queries.js';

/** What a gated page shows before it knows who is signed in: a skeleton while
 *  /api/me is in flight, and a Try again once it has failed. Without it the
 *  page is a title over nothing, and stays that way if the request never lands. */
export default function MeStatus() {
  const { isError, isFetching, refetch } = useMe();
  if (isError) {
    return (
      <div className="pause-access">
        <p role="alert" className="pause-error">Couldn&apos;t reach Pause.</p>
        <button type="button" className="pause-quiet" aria-disabled={isFetching} onClick={() => !isFetching && refetch()}>
          {isFetching ? 'Trying…' : 'Try again'}
        </button>
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => <div key={i} className="pause-skeleton pause-skeleton-row" />)}
    </div>
  );
}

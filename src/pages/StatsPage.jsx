import PropTypes from 'prop-types';
import BackLink from '../components/BackLink.jsx';
import AccessNote from '../components/AccessNote.jsx';
import { isMember, useStats } from '../lib/queries.js';
import './StatsPage.css';

const TOP = 12;
// Quarter-hour rounding, except a non-zero total never rounds down to a bare "0 h" beside its bar.
const fmtHours = (h) => {
  const q = Math.round(h * 4) / 4;
  return h > 0 && q === 0 ? '< 0.25 h' : `${q} h`;
};
const NONE = 'None of your plans has activities yet.';

function Bars({ label, rows, max, value }) {
  return (
    <ul className="stat-bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="stat-row">
          <span className="stat-label">{r.label}</span>
          <span className="stat-track" aria-hidden="true">
            {r.n > 0 && <span className="stat-fill" style={{ inlineSize: `${(r.n / max) * 100}%` }} />}
          </span>
          <span className="stat-value">{value(r.n)}</span>
        </li>
      ))}
    </ul>
  );
}

Bars.propTypes = {
  label: PropTypes.string.isRequired,
  rows: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, label: PropTypes.string, n: PropTypes.number })).isRequired,
  max: PropTypes.number.isRequired,
  value: PropTypes.func.isRequired,
};

export default function StatsPage({ me }) {
  const member = isMember(me);
  const q = useStats(member);
  const s = q.data;

  let body;
  if (!me) body = null;
  else if (!member) body = <AccessNote me={me} next="/stats" />;
  else if (q.isPending) body = <div aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="pause-skeleton stat-skeleton" />)}</div>;
  else if (q.isError) body = (
    <div className="pause-access">
      <p>{"Stats didn't load."}</p>
      <button type="button" className="pause-quiet" onClick={() => q.refetch()}>Try again</button>
    </div>
  );
  else if (s.empty) body = (
    <div className="pause-access">
      <p>Stats appear once you save a plan.</p>
      <a className="pause-link" href="/">Plan something</a>
    </div>
  );
  else {
    const top = s.hours.slice(0, TOP);
    const rest = s.hours.length - top.length;
    const maxHours = Math.max(...top.map((h) => h.hours), 1);
    const maxMonth = Math.max(...s.months.map((m) => m.count), 1);
    body = (
      <>
        <section className="stat-section">
          <h2>Hours planned</h2>
          {top.length === 0 ? <p>{NONE}</p> : (
            <Bars label="Hours planned" rows={top.map((h) => ({ key: h.label, label: h.label, n: h.hours }))} max={maxHours} value={fmtHours} />
          )}
          {rest > 0 && <p className="pause-muted">Plus {rest} more {rest === 1 ? 'activity' : 'activities'}</p>}
          {top.length > 0 && s.plansWithoutActivities > 0 && (
            <p className="pause-muted">Plus {s.plansWithoutActivities} {s.plansWithoutActivities === 1 ? 'plan' : 'plans'} with no activities.</p>
          )}
        </section>
        <section className="stat-section">
          <h2>Plans per month</h2>
          <Bars label="Plans per month" rows={s.months.map((m) => ({ key: m.key, label: m.label, n: m.count }))} max={maxMonth} value={(n) => String(n)} />
        </section>
        <section className="stat-section">
          <h2>Most planned</h2>
          {s.mostPlanned ? (
            <p className="stat-most"><span className="stat-most-label">{s.mostPlanned.label}</span> <span className="pause-muted">in {s.mostPlanned.plans} of {s.planCount} plans</span></p>
          ) : <p>{NONE}</p>}
        </section>
      </>
    );
  }

  return (
    <main className="pause-page">
      <BackLink />
      <h1 className="pause-page-title">Stats</h1>
      {body}
    </main>
  );
}

StatsPage.propTypes = { me: PropTypes.shape({ state: PropTypes.string, email: PropTypes.string }) };

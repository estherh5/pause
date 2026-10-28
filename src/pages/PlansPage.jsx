import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import BackLink from '../components/BackLink.jsx';
import AccessNote from '../components/AccessNote.jsx';
import MeStatus from '../components/MeStatus.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { api, ApiError } from '../lib/api.js';
import { isMember, usePlans } from '../lib/queries.js';
import { usePlanner } from '../lib/planner-context.jsx';
import { activityCountLabel, periodLabel, savedOnLabel } from '../lib/plan-labels.js';
import { validatePlanName } from '../../lib/plan-name.ts';
import './PlansPage.css';

const nameError = (err, name) => (err instanceof ApiError && err.code === 'duplicate-name'
  ? `You already have a plan called "${name}".`
  : "The plan didn't save. Check your connection and try again.");

function PlanRow({ plan, onRemoved, announce }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { isDirty, syncCurrentPlan } = usePlanner();
  const [mode, setMode] = useState('view'); // view | rename | delete
  const [draft, setDraft] = useState(plan.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const renameRef = useRef(null);
  const fieldRef = useRef(null);
  const copiedTimer = useRef(null);

  useEffect(() => { if (mode === 'rename') fieldRef.current?.select(); }, [mode]);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  function endRename() {
    setMode('view');
    setError('');
    setDraft(plan.name);
    // The rename button remounts with the view; focus lands a frame later.
    requestAnimationFrame(() => requestAnimationFrame(() => renameRef.current?.focus()));
  }

  async function saveName() {
    const checked = validatePlanName(draft);
    if (!checked.ok) { setError(checked.error); return; }
    setBusy(true);
    try {
      await api.updatePlan(plan.id, { name: checked.name });
      syncCurrentPlan(plan.id, { name: checked.name });
      await queryClient.invalidateQueries({ queryKey: ['plans'] });
      setMode('view');
      setError('');
      requestAnimationFrame(() => requestAnimationFrame(() => renameRef.current?.focus()));
    } catch (err) {
      setError(nameError(err, checked.name));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deletePlan(plan.id);
      syncCurrentPlan(plan.id, null);
      onRemoved(plan.id);
      await queryClient.invalidateQueries({ queryKey: ['plans'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch {
      setError("The plan wasn't deleted. Try again.");
      setBusy(false);
    }
  }

  async function open(e) {
    if (!isDirty) return; // plain navigation to /?plan=<id>
    // A new tab or window leaves this planner untouched, so let the browser have it.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (await confirm({ title: `Open "${plan.name}"?`, body: "The plan on screen has changes that aren't saved.", confirmLabel: 'Open', cancelLabel: 'Keep editing' })) {
      navigate(`/?plan=${encodeURIComponent(plan.id)}`);
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?activities=${plan.shareId}`);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
      announce('Copied');
    } catch {
      announce("The link didn't copy.");
    }
  }

  return (
    <li className="plan-row" data-plan-id={plan.id}>
      {mode === 'rename' ? (
        <form className="plan-rename" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
          <input
            ref={fieldRef}
            className="pause-field"
            aria-label="Plan name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); endRename(); } }}
          />
          {error && <p role="alert" className="pause-error">{error}</p>}
          <div className="plan-actions">
            <button type="button" className="pause-quiet" onClick={endRename}>Cancel</button>
            <button type="submit" className="pause-button" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="plan-text">
            <span className="plan-name">{plan.name}</span>
            <span className="plan-meta pause-muted">
              {periodLabel(plan)} · {activityCountLabel(plan.activityCount)} · {savedOnLabel(plan.updatedAt)}
            </span>
          </div>
          {mode === 'delete' ? (
            <div className="plan-confirm">
              <p>{`Delete "${plan.name}"? Its share link stops working.`}</p>
              {error && <p role="alert" className="pause-error">{error}</p>}
              <div className="plan-actions">
                <button type="button" className="pause-quiet" onClick={() => { setMode('view'); setError(''); }}>Keep</button>
                <button type="button" className="pause-quiet plan-delete" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          ) : (
            <div className="plan-actions">
              <a className="pause-quiet plan-open" href={`/?plan=${encodeURIComponent(plan.id)}`} onClick={open}>Open</a>
              <button type="button" className="plan-icon" aria-label={copied ? 'Copied' : `Copy share link for ${plan.name}`} onClick={share}><i className={`fas ${copied ? 'fa-check' : 'fa-link'}`} aria-hidden="true" /></button>
              <button ref={renameRef} type="button" className="plan-icon" aria-label={`Rename ${plan.name}`} onClick={() => setMode('rename')}><i className="fas fa-pen" aria-hidden="true" /></button>
              <button type="button" className="plan-icon" aria-label={`Delete ${plan.name}`} onClick={() => setMode('delete')}><i className="fas fa-trash" aria-hidden="true" /></button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
PlanRow.propTypes = {
  plan: PropTypes.shape({
    id: PropTypes.string, name: PropTypes.string, shareId: PropTypes.string, updatedAt: PropTypes.number, activityCount: PropTypes.number,
  }).isRequired,
  onRemoved: PropTypes.func.isRequired,
  announce: PropTypes.func.isRequired,
};

export default function PlansPage({ me }) {
  const member = isMember(me);
  const plans = usePlans(member);
  const [status, setStatus] = useState('');
  const listRef = useRef(null);
  const titleRef = useRef(null);
  const statusTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  function announce(text) {
    setStatus(text);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(''), 2000);
  }
  function onRemoved(id) {
    // Focus the Open link of the row that takes the removed row's place, else the
    // previous row's, else the title when the list empties. Pick the target row now,
    // while the removed row is still in the DOM, then focus it a frame later.
    const rows = [...(listRef.current?.querySelectorAll('.plan-row') ?? [])];
    const at = rows.findIndex((r) => r.dataset.planId === id);
    const target = rows[at + 1] ?? rows[at - 1];
    const targetId = at >= 0 ? target?.dataset.planId : undefined;
    requestAnimationFrame(() => {
      const el = targetId === undefined ? null : [...(listRef.current?.querySelectorAll('.plan-row') ?? [])].find((r) => r.dataset.planId === targetId);
      (el?.querySelector('.plan-open') ?? titleRef.current)?.focus();
    });
  }

  return (
    <main className="pause-page">
      <BackLink />
      <h1 ref={titleRef} tabIndex={-1} className="pause-page-title">My plans</h1>
      <p role="status" className="pause-visually-hidden">{status}</p>
      {!me ? <MeStatus /> : !member ? <AccessNote me={me} next="/plans" /> : plans.isPending ? (
        <ul className="plan-list" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="plan-row"><div className="pause-skeleton" style={{ inlineSize: `${60 - i * 10}%` }} /></li>)}</ul>
      ) : plans.isError ? (
        <div className="pause-access">
          <p>{"Your plans didn't load."}</p>
          <button type="button" className="pause-quiet" onClick={() => plans.refetch()}>Try again</button>
        </div>
      ) : plans.data.length === 0 ? (
        <div className="pause-access">
          <p>No saved plans yet.</p>
          <a className="pause-button pause-cta" href="/">Plan something</a>
        </div>
      ) : (
        <ul ref={listRef} className="plan-list">
          {plans.data.map((p) => <PlanRow key={p.id} plan={p} onRemoved={onRemoved} announce={announce} />)}
        </ul>
      )}
    </main>
  );
}
PlansPage.propTypes = { me: PropTypes.shape({ state: PropTypes.string, email: PropTypes.string }) };

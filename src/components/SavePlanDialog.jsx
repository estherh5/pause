import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api.js';
import { usePlanner } from '../lib/planner-context.jsx';
import { scheduleToPayload } from '../lib/schedule.js';
import { defaultPlanName } from '../lib/plan-labels.js';
import { MAX_NAME_LENGTH, validatePlanName } from '../../lib/plan-name.ts';
import './SavePlanDialog.css';

function messageFor(err, name) {
  if (err instanceof ApiError) {
    if (err.code === 'duplicate-name') return `You already have a plan called "${name}".`;
    if (err.code === 'plan-limit') return 'You have 500 saved plans. Delete one to save another.';
    if (err.status === 404) return 'This plan was deleted. Save it as a new plan.';
    if (err.status === 400 && err.code) return err.code; // the server's own validation sentence
  }
  return "The plan didn't save. Check your connection and try again.";
}

/** Spec 5.3. `onSaved(summary)` lets the page show the share link. The parent
 *  keys this component on an open counter, so name and error are seeded by
 *  the initial state of each opening; the effect only drives the <dialog>. */
export default function SavePlanDialog({ open, onClose, onSaved }) {
  const { schedule, currentPlan, markSaved } = usePlanner();
  const queryClient = useQueryClient();
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const [name, setName] = useState(
    () => currentPlan?.name || defaultPlanName(schedule.timeUnit, schedule.month, schedule.year, new Date()),
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // 'save' | 'new' | null
  // State lags a double click by one render; the ref does not.
  const inFlight = useRef(false);
  const editing = Boolean(currentPlan?.id);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      requestAnimationFrame(() => inputRef.current?.select());
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  async function submit(mode) {
    if (inFlight.current) return;
    const checked = validatePlanName(name);
    if (!checked.ok) { setError(checked.error); return; }
    inFlight.current = true;
    setPending(mode);
    setError('');
    try {
      const plan = scheduleToPayload(schedule);
      const saved = mode === 'save' && editing
        ? await api.updatePlan(currentPlan.id, { name: checked.name, plan })
        : await api.createPlan(checked.name, plan);
      markSaved({ id: saved.id, name: saved.name, shareId: saved.shareId });
      await queryClient.invalidateQueries({ queryKey: ['plans'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
      onSaved(saved);
    } catch (err) {
      setError(messageFor(err, checked.name));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return (
    <dialog ref={dialogRef} className="pause-dialog" aria-labelledby="save-plan-title" onClose={onClose}>
      <form
        method="dialog"
        aria-busy={pending ? 'true' : 'false'}
        onSubmit={(e) => { e.preventDefault(); submit('save'); }}
      >
        <h2 id="save-plan-title" className="pause-dialog-title">Save plan</h2>
        <label className="pause-field-label" htmlFor="plan-name">Name</label>
        <input
          ref={inputRef}
          id="plan-name"
          name="name"
          className="pause-field"
          maxLength={MAX_NAME_LENGTH * 2}
          autoComplete="off"
          value={name}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? 'plan-name-error' : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p id="plan-name-error" role="alert" className="pause-error pause-field-error">{error}</p>}
        <div className="pause-dialog-actions">
          <button type="button" className="pause-quiet" disabled={Boolean(pending)} onClick={onClose}>Cancel</button>
          {editing && (
            <button type="button" className="pause-quiet" disabled={Boolean(pending)} onClick={() => submit('new')}>
              {pending === 'new' ? 'Saving…' : 'Save as new plan'}
            </button>
          )}
          <button type="submit" className="pause-button" disabled={Boolean(pending)}>
            {pending === 'save' ? 'Saving…' : editing ? 'Save changes' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

SavePlanDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useFormDraft } from '../components/useFormDraft';
import { draftKey } from './form-draft';
import { createInitialSchedule, scheduleKey } from './schedule.js';

const PlannerContext = createContext(null);

const NEW_PLAN_SCOPE = 'plan:new';

/**
 * Where the plan on screen keeps its draft, and how a waiting draft is treated.
 *
 * A blank-start plan has no server-side truth to contradict, so its draft is
 * simply back. A plan reached through a link is real and may have changed since,
 * so its draft is offered, never applied over it.
 *
 * `holding` covers the gap between arriving on a link and its plan landing.
 * Falling back to plan:new there would restore the blank-start draft onto the
 * screen, notice and all, until the linked plan replaced it. Nothing is read or
 * kept while holding; the scope names the link once its plan is on screen, and
 * the hook re-reads its baseline from that.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function draftScope({ currentPlan, loadedShareId, linkPending }) {
  if (currentPlan?.id) return { scope: `plan:${currentPlan.id}`, mode: 'offer', holding: false };
  if (loadedShareId) return { scope: `share:${loadedShareId}`, mode: 'offer', holding: false };
  if (linkPending) return { scope: 'plan:opening', mode: 'offer', holding: true };
  return { scope: NEW_PLAN_SCOPE, mode: 'restore', holding: false };
}

/** A draft written by an older shape, or tampered with, is not a schedule. */
function parseSchedule(raw) {
  try {
    const s = JSON.parse(raw);
    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!isObject(s) || !isObject(s.activities) || !isObject(s.chartTypes) || typeof s.timeUnit !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}

/** The plan on screen lives ABOVE the routes (spec D9), so /plans and /stats
 *  never cost the person their unsaved work, and a reload does not either. */
export function PlannerProvider({ children }) {
  const [schedule, setSchedule] = useState(createInitialSchedule);
  const [baseline, setBaseline] = useState(() => scheduleKey(createInitialSchedule()));
  const [currentPlan, setCurrentPlan] = useState(null);
  // The share id the schedule was last loaded from, so a remounted planner
  // (route change and back) does not refetch over the person's edits.
  const [loadedShareId, setLoadedShareId] = useState(null);

  // The same two reads Planner makes to decide what to load: ?plan= through the
  // router, ?activities= from the window.
  const { search } = useLocation();
  const sharePending = new URLSearchParams(window.location.search).get('activities');
  const linkPending = Boolean(new URLSearchParams(search).get('plan'))
    || Boolean(sharePending && sharePending !== loadedShareId);
  const { scope, mode, holding } = draftScope({ currentPlan, loadedShareId, linkPending });

  // The one live draft hook for the plan. The grid is not a DOM form, so the
  // whole schedule travels as a single field.
  const draft = useFormDraft({
    scope,
    mode,
    snapshot: () => (holding ? {} : { schedule: scheduleKey(schedule) }),
    apply: (fields) => {
      const next = parseSchedule(fields.schedule);
      if (next) setSchedule(next);
    },
  });
  const { clear: clearDraft } = draft;

  const loadSchedule = useCallback((next, plan, shareId = null) => {
    setSchedule(next);
    setBaseline(scheduleKey(next));
    setCurrentPlan(plan ?? null);
    setLoadedShareId(shareId);
  }, []);
  const resetSchedule = useCallback(() => {
    clearDraft();
    loadSchedule(createInitialSchedule(), null);
  }, [clearDraft, loadSchedule]);
  const markSaved = useCallback((plan) => {
    clearDraft();
    setCurrentPlan(plan);
    setSchedule((s) => { setBaseline(scheduleKey(s)); return s; });
  }, [clearDraft]);

  // /plans renamed (patch) or deleted (null) a plan: keep the plan on screen in step.
  const syncCurrentPlan = useCallback((id, patch) => {
    if (!currentPlan || currentPlan.id !== id) return;
    if (patch) { setCurrentPlan({ ...currentPlan, ...patch }); return; }
    // Deleted: the work on screen is no longer saved anywhere, so measure it
    // against an unsaved new plan's baseline and let it read as dirty.
    // It now IS the new plan, so an older blank-start draft must not be
    // restored over it when the scope falls back to plan:new.
    try { window.localStorage.removeItem(draftKey(NEW_PLAN_SCOPE)); } catch { /* private mode */ }
    setCurrentPlan(null);
    setBaseline(scheduleKey(createInitialSchedule()));
  }, [currentPlan]);

  const draftNotice = useMemo(
    () => ({ state: draft.state, restore: draft.restore, discard: draft.discard }),
    [draft.state, draft.restore, draft.discard],
  );

  const value = useMemo(() => ({
    schedule, setSchedule, currentPlan, loadedShareId, isDirty: scheduleKey(schedule) !== baseline,
    loadSchedule, resetSchedule, markSaved, syncCurrentPlan, draft: draftNotice,
  }), [schedule, currentPlan, loadedShareId, baseline, loadSchedule, resetSchedule, markSaved, syncCurrentPlan, draftNotice]);
  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

PlannerProvider.propTypes = { children: PropTypes.node };

// eslint-disable-next-line react-refresh/only-export-components
export function usePlanner() {
  const v = useContext(PlannerContext);
  if (!v) throw new Error('usePlanner outside PlannerProvider');
  return v;
}

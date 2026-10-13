import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createInitialSchedule, scheduleKey } from './schedule.js';

const PlannerContext = createContext(null);

/** The plan on screen lives ABOVE the routes (spec D9), so /plans and /stats
 *  never cost the person their unsaved work. */
export function PlannerProvider({ children }) {
  const [schedule, setSchedule] = useState(createInitialSchedule);
  const [baseline, setBaseline] = useState(() => scheduleKey(createInitialSchedule()));
  const [currentPlan, setCurrentPlan] = useState(null);
  // The share id the schedule was last loaded from, so a remounted planner
  // (route change and back) does not refetch over the person's edits.
  const [loadedShareId, setLoadedShareId] = useState(null);

  const loadSchedule = useCallback((next, plan, shareId = null) => {
    setSchedule(next);
    setBaseline(scheduleKey(next));
    setCurrentPlan(plan ?? null);
    setLoadedShareId(shareId);
  }, []);
  const resetSchedule = useCallback(() => loadSchedule(createInitialSchedule(), null), [loadSchedule]);
  const markSaved = useCallback((plan) => {
    setCurrentPlan(plan);
    setSchedule((s) => { setBaseline(scheduleKey(s)); return s; });
  }, []);

  // /plans renamed (patch) or deleted (null) a plan: keep the plan on screen in step.
  const syncCurrentPlan = useCallback((id, patch) => {
    if (!currentPlan || currentPlan.id !== id) return;
    if (patch) { setCurrentPlan({ ...currentPlan, ...patch }); return; }
    // Deleted: the work on screen is no longer saved anywhere, so measure it
    // against an unsaved new plan's baseline and let it read as dirty.
    setCurrentPlan(null);
    setBaseline(scheduleKey(createInitialSchedule()));
  }, [currentPlan]);

  const value = useMemo(() => ({
    schedule, setSchedule, currentPlan, loadedShareId, isDirty: scheduleKey(schedule) !== baseline,
    loadSchedule, resetSchedule, markSaved, syncCurrentPlan,
  }), [schedule, currentPlan, loadedShareId, baseline, loadSchedule, resetSchedule, markSaved, syncCurrentPlan]);
  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

PlannerProvider.propTypes = { children: PropTypes.node };

// eslint-disable-next-line react-refresh/only-export-components
export function usePlanner() {
  const v = useContext(PlannerContext);
  if (!v) throw new Error('usePlanner outside PlannerProvider');
  return v;
}

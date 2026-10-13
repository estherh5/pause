import PropTypes from 'prop-types';
import { useCallback, useEffect, useState } from 'react';
import {
  MONTHS,
  addActivityColors,
  createPeriodState,
  getDaysInMonth,
} from '../activities.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE, api, ApiError } from '../lib/api.js';
import { isMember } from '../lib/queries.js';
import SavePlanDialog from '../components/SavePlanDialog.jsx';
import { usePlanner } from '../lib/planner-context.jsx';
import { planToSchedule, shareToSchedule } from '../lib/schedule.js';
import { SelectMenu } from '../components/SelectMenu';
import Calculator from '../Calculator/Calculator.jsx';
import DayData from '../DayData/DayData.jsx';
import Modal from '../Modal/Modal.jsx';
import StarterButtons from '../StarterButtons/StarterButtons.jsx';

function Planner({ me = null }) {
  const { schedule, setSchedule, loadSchedule, loadedShareId, currentPlan, isDirty } = usePlanner();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [saveOpen, setSaveOpen] = useState(false);
  // Counts openings so each one remounts the dialog with fresh name/error state.
  const [saveKey, setSaveKey] = useState(0);
  const planId = searchParams.get('plan');
  const member = isMember(me);
  // True until the fetch settles: settling navigates away, which clears ?plan=.
  const opening = Boolean(planId && member);
  const [modal, setModal] = useState({
    display: false,
    status: null,
    message: null,
    link: null,
    title: null,
    note: null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const apiUrl = API_BASE;

  const showError = useCallback((message) => {
    setModal({
      display: true,
      status: 'fail',
      message,
      link: null,
      title: null,
      note: null,
    });
  }, []);

  useEffect(() => {
    if (!planId || !member) return undefined;
    let live = true;
    api.getPlan(planId)
      .then((p) => {
        if (!live) return;
        loadSchedule(planToSchedule(p), { id: p.id, name: p.name, shareId: p.shareId });
        navigate('/', { replace: true });
      })
      .catch((err) => {
        if (!live) return;
        showError(err instanceof ApiError && err.status === 404
          ? "That plan isn't in your saved plans."
          : 'Your plan could not be loaded. Try again soon.');
        navigate('/', { replace: true });
      });
    return () => { live = false; };
  }, [planId, member, loadSchedule, navigate, showError]);

  useEffect(() => {
    const dataId = new URLSearchParams(window.location.search).get('activities');

    if (!dataId) {
      document.getElementById('text0?')?.focus();
      return undefined;
    }

    // Already on screen (remount after a route change): keep the edits.
    if (dataId === loadedShareId) return undefined;

    const controller = new AbortController();

    async function loadActivities() {
      try {
        const response = await fetch(
          `${apiUrl}/pause/activities/${encodeURIComponent(dataId)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = await response.json();
        loadSchedule(
          shareToSchedule(data),
          data.name ? { id: null, name: data.name, shareId: dataId } : null,
          dataId,
        );
      } catch (error) {
        if (error.name !== 'AbortError') {
          showError('Your activities could not be loaded. Try again soon.');
        }
      }
    }

    loadActivities();
    return () => controller.abort();
  }, [apiUrl, showError, loadSchedule, loadedShareId]);

  function setTimeUnit(event) {
    const timeUnit = event.target.value;
    let month = null;
    let year = null;
    let dayCount = 1;

    if (timeUnit === 'week') {
      dayCount = 7;
    } else if (timeUnit === 'month') {
      const now = new Date();
      const monthIndex = now.getMonth();
      month = MONTHS[monthIndex];
      year = now.getFullYear();
      dayCount = getDaysInMonth(year, monthIndex);
    }

    setSchedule({
      ...createPeriodState(dayCount),
      timeUnit,
      month,
      year,
    });
  }

  function toggleMonth(event) {
    const currentMonthIndex = MONTHS.indexOf(schedule.month);
    const offset = event.currentTarget.dataset.direction === 'decrement' ? -1 : 1;
    const nextDate = new Date(schedule.year, currentMonthIndex + offset, 1);
    const monthIndex = nextDate.getMonth();
    const year = nextDate.getFullYear();

    setSchedule({
      ...createPeriodState(getDaysInMonth(year, monthIndex)),
      timeUnit: 'month',
      month: MONTHS[monthIndex],
      year,
    });
  }

  function updateActivities(componentId, activities) {
    setSchedule((current) => ({
      ...current,
      activities: {
        ...current.activities,
        [componentId]: addActivityColors(activities),
      },
    }));
  }

  function updateChartType(componentId, chartType) {
    setSchedule((current) => ({
      ...current,
      chartTypes: {
        ...current.chartTypes,
        [componentId]: chartType,
      },
    }));
  }

  function replaceActivities(activities) {
    const coloredActivities = addActivityColors(activities);

    setSchedule((current) => ({
      ...current,
      activities: Object.fromEntries(
        Object.keys(current.activities).map((id) => [
          id,
          coloredActivities.map((activity) => ({ ...activity })),
        ]),
      ),
    }));
  }

  async function postData() {
    setIsSaving(true);
    document.body.style.cursor = 'wait';

    try {
      const response = await fetch(`${apiUrl}/pause/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities: schedule.activities,
          chartTypes: schedule.chartTypes,
          timeUnit: schedule.timeUnit,
          month: schedule.month,
          year: schedule.year,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const dataId = await response.json();
      setModal({
        display: true,
        status: 'success',
        message: null,
        link: `${window.location.origin}/?activities=${dataId}`,
        title: null,
        note: me?.state === 'signed-out'
          ? <><a className="pause-link" href="/signin">Sign in</a> to keep plans by name.</>
          : null,
      });
    } catch {
      showError('Your activities could not be saved. Try again soon.');
    } finally {
      document.body.style.cursor = '';
      setIsSaving(false);
    }
  }

  function onSave() {
    if (member) {
      setSaveKey((k) => k + 1);
      setSaveOpen(true);
    } else {
      postData(); // the anonymous path, unchanged
    }
  }

  const controlsDisabled = isSaving || modal.display;

  return (
    <>
      <Modal
        display={modal.display}
        status={modal.status}
        message={modal.message}
        link={modal.link}
        title={modal.title}
        note={modal.note}
        onCloseModal={() => setModal((current) => ({ ...current, display: false }))}
      />
      <div id="app-container">
        <h1 id="title">
          <a href="." title="Pause" data-reload>Pause</a>
        </h1>
        <h2 id="subtitle">
          How do you want to spend your&nbsp;
          <SelectMenu
            id="select-time-unit"
            className="selectbox pause-time-unit"
            ariaLabel="Toggle time period"
            value={schedule.timeUnit}
            placeholder="day"
            options={[
              { value: 'day', label: 'day' },
              { value: 'week', label: 'week' },
              { value: 'month', label: 'month' },
            ]}
            onChange={(value) => setTimeUnit({ target: { value } })}
            disabled={controlsDisabled}
          />
          ?
        </h2>
        {schedule.timeUnit === 'month' && (
          <div id="month-toggle">
            <button
              title="Previous month"
              data-direction="decrement"
              disabled={controlsDisabled}
              onClick={toggleMonth}
            >
              <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>
            <h2 id="month">{schedule.month} {schedule.year}</h2>
            <button
              title="Next month"
              data-direction="increment"
              disabled={controlsDisabled}
              onClick={toggleMonth}
            >
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          </div>
        )}
        {opening && <p className="pause-muted" role="status">Opening plan…</p>}
        {currentPlan && (
          <p className="pause-plan-name">
            <span>{currentPlan.name}</span>
            {currentPlan.id && isDirty && <span className="pause-muted"> · unsaved changes</span>}
          </p>
        )}
        <div id="day-data-container">
          {Object.keys(schedule.activities).map((id) => (
            <DayData
              key={`${id}-${schedule.timeUnit}-${schedule.month}`}
              id={Number(id)}
              activities={schedule.activities[id]}
              chartType={schedule.chartTypes[id]}
              timeUnit={schedule.timeUnit}
              month={schedule.timeUnit === 'month' ? schedule.month : null}
              onActivitiesUpdate={updateActivities}
              onChartTypeEdit={updateChartType}
            />
          ))}
        </div>
        <div id="button-container">
          <StarterButtons
            disabled={controlsDisabled}
            onButtonClick={replaceActivities}
          />
        </div>
        <div id="save-container">
          <button
            id="save"
            disabled={controlsDisabled}
            onClick={onSave}
          >
            Save
          </button>
          {member && <a className="pause-quiet pause-my-plans" href="/plans">My plans</a>}
          {me?.state === 'guest' && (
            <p className="pause-muted pause-guest-note">{`Saved plans are by invitation. ${me.email} doesn't have one.`}</p>
          )}
        </div>
        <SavePlanDialog
          key={saveKey}
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          onSaved={(saved) => {
            setSaveOpen(false);
            setModal({
              display: true,
              status: 'success',
              title: 'Saved',
              message: `"${saved.name}" is in My plans.`,
              link: `${window.location.origin}/?activities=${saved.shareId}`,
              note: null,
            });
          }}
        />
        <Calculator activities={schedule.activities} />
      </div>
    </>
  );
}

Planner.propTypes = { me: PropTypes.shape({ state: PropTypes.string, email: PropTypes.string }) };

export default Planner;

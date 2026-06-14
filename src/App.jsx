import { useCallback, useEffect, useState } from 'react';
import './App.css';
import {
  MONTHS,
  addActivityColors,
  createPeriodState,
  createStartingActivities,
  getDaysInMonth,
} from './activities.js';
import Calculator from './Calculator/Calculator.jsx';
import DayData from './DayData/DayData.jsx';
import Header from './Header/Header.jsx';
import Modal from './Modal/Modal.jsx';
import StarterButtons from './StarterButtons/StarterButtons.jsx';

const PRODUCTION_API_URL =
  'https://pause-app-api-4611c9bb3463.herokuapp.com/api';

function getApiUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return window.location.hostname === 'pause.crystalprism.io'
    ? PRODUCTION_API_URL
    : 'http://localhost:5000/api';
}

const initialState = {
  activities: { 0: createStartingActivities() },
  chartTypes: { 0: 'pie' },
  timeUnit: 'day',
  month: null,
  year: null,
};

function App() {
  const [schedule, setSchedule] = useState(initialState);
  const [modal, setModal] = useState({
    display: false,
    status: null,
    message: null,
    link: null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const apiUrl = getApiUrl();

  const showError = useCallback((message) => {
    setModal({
      display: true,
      status: 'fail',
      message,
      link: null,
    });
  }, []);

  useEffect(() => {
    const dataId = new URLSearchParams(window.location.search).get('activities');

    if (!dataId) {
      document.getElementById('text0?')?.focus();
      return undefined;
    }

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
        setSchedule({
          activities: data.activities,
          chartTypes: data.chart_types,
          timeUnit: data.time_unit,
          month: data.month,
          year: data.year,
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          showError('Your activities could not be loaded. Please try again soon.');
        }
      }
    }

    loadActivities();
    return () => controller.abort();
  }, [apiUrl, showError]);

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
        message: 'You can view your activities here:',
        link: `${window.location.origin}/?activities=${dataId}`,
      });
    } catch {
      showError('Your activities could not be saved. Please try again soon.');
    } finally {
      document.body.style.cursor = '';
      setIsSaving(false);
    }
  }

  const controlsDisabled = isSaving || modal.display;

  return (
    <div id="main-container">
      <Modal
        display={modal.display}
        status={modal.status}
        message={modal.message}
        link={modal.link}
        onCloseModal={() => setModal((current) => ({ ...current, display: false }))}
      />
      <Header />
      <div id="app-container">
        <h1 id="title">
          <a href="." title="Pause">Pause</a>
        </h1>
        <h2 id="subtitle">
          How do you want to spend your&nbsp;
          <select
            id="select-time-unit"
            title="Toggle time period"
            value={schedule.timeUnit}
            onChange={setTimeUnit}
          >
            <option value="day">day</option>
            <option value="week">week</option>
            <option value="month">month</option>
          </select>
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
            onClick={postData}
          >
            Save
          </button>
        </div>
        <Calculator activities={schedule.activities} />
      </div>
    </div>
  );
}

export default App;

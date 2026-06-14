import PropTypes from 'prop-types';
import { activityPropType } from '../propTypes.js';
import './DayData.css';
import Chart from './Chart/Chart.jsx';
import Table from './Table/Table.jsx';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function clearErrors(activities) {
  return activities.map(({ errorMessage: _errorMessage, ...activity }) => activity);
}

function DayData({
  id,
  activities,
  chartType,
  timeUnit,
  month,
  onActivitiesUpdate,
  onChartTypeEdit,
}) {
  function addActivity(newActivity, errorMessage) {
    const current = clearErrors(activities);
    const newIndex = current.findIndex((activity) => activity.id === '?');
    const emptyIndex = current.findIndex((activity) => activity.id === 0);

    if (errorMessage) {
      current[newIndex] = {
        ...current[newIndex],
        ...newActivity,
        errorMessage,
      };
      onActivitiesUpdate(id, current);
      return;
    }

    current[emptyIndex] = {
      ...current[emptyIndex],
      value: current[emptyIndex].value - newActivity.value,
    };

    if (current[emptyIndex].value > 0) {
      current[newIndex] = { id: '?', value: '', label: '' };
      current.push(newActivity, current.splice(newIndex, 1)[0]);
    } else {
      current.splice(newIndex, 1);
      current.push(newActivity);
    }

    onActivitiesUpdate(id, current);
  }

  function updateLabel(activityId, newLabel, errorMessage) {
    if (!newLabel) {
      removeActivity(activityId);
      return;
    }

    const current = clearErrors(activities).map((activity) => {
      if (activity.id !== activityId) {
        return activity;
      }

      return errorMessage
        ? { ...activity, errorMessage }
        : { ...activity, label: newLabel };
    });

    onActivitiesUpdate(id, current);
  }

  function updateHours(activityId, newHours, errorMessage, combinedId) {
    if (errorMessage) {
      onActivitiesUpdate(
        id,
        clearErrors(activities).map((activity) =>
          activity.id === activityId
            ? { ...activity, errorMessage }
            : activity,
        ),
      );
      return;
    }

    if (!newHours) {
      removeActivity(activityId);
      return;
    }

    let current = clearErrors(activities);
    const previousActivity = current.find((activity) => activity.id === activityId);
    const emptyIndex = current.findIndex((activity) => activity.id === 0);

    if (combinedId != null) {
      current = current.filter((activity) => activity.id !== combinedId);
    } else {
      current[emptyIndex] = {
        ...current[emptyIndex],
        value: current[emptyIndex].value + previousActivity.value - newHours,
      };
    }

    current = current.map((activity) =>
      activity.id === activityId
        ? { ...activity, value: newHours }
        : activity,
    );

    const remainingHours = current.find((activity) => activity.id === 0).value;
    const newIndex = current.findIndex((activity) => activity.id === '?');

    if (remainingHours > 0 && newIndex === -1) {
      current.push({ id: '?', value: '', label: '' });
    } else if (remainingHours === 0 && newIndex !== -1) {
      current.splice(newIndex, 1);
    }

    onActivitiesUpdate(id, current);
  }

  function removeActivity(activityId) {
    const current = clearErrors(activities);
    const removed = current.find((activity) => activity.id === activityId);

    if (!removed) {
      return;
    }

    let next = current
      .filter((activity) => activity.id !== activityId)
      .map((activity) =>
        activity.id === 0
          ? { ...activity, value: activity.value + removed.value }
          : activity,
      );

    if (!next.some((activity) => activity.id === '?')) {
      next = [...next, { id: '?', value: '', label: '' }];
    }

    onActivitiesUpdate(id, next);
  }

  return (
    <div className={`day-container ${timeUnit}`}>
      {timeUnit === 'week' && (
        <h3 className="day-header">{WEEKDAYS[id]}</h3>
      )}
      {timeUnit === 'month' && (
        <h3 className="day-header">{month} {id + 1}</h3>
      )}
      <div className={`data-container ${timeUnit}`}>
        <Table
          id={id}
          activities={activities}
          timeUnit={timeUnit}
          onLabelEdit={updateLabel}
          onHoursEdit={updateHours}
          onAddActivity={addActivity}
          onDeleteActivity={removeActivity}
        />
        <Chart
          id={id}
          timeUnit={timeUnit}
          activities={activities}
          chartType={chartType}
          onChartTypeChange={onChartTypeEdit}
        />
      </div>
    </div>
  );
}

export default DayData;

DayData.propTypes = {
  id: PropTypes.number.isRequired,
  activities: PropTypes.arrayOf(activityPropType).isRequired,
  chartType: PropTypes.oneOf(['pie', 'bar', 'radar', 'doughnut']).isRequired,
  timeUnit: PropTypes.oneOf(['day', 'week', 'month']).isRequired,
  month: PropTypes.string,
  onActivitiesUpdate: PropTypes.func.isRequired,
  onChartTypeEdit: PropTypes.func.isRequired,
};

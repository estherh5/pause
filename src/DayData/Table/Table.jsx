import { Fragment, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { activityPropType } from '../../propTypes.js';
import './Table.css';
import ActivityInput from './ActivityInput/ActivityInput.jsx';

function Table({
  id,
  activities,
  timeUnit,
  onLabelEdit,
  onHoursEdit,
  onAddActivity,
  onDeleteActivity,
}) {
  const newLabelRef = useRef(null);
  const newHoursRef = useRef(null);

  useEffect(() => {
    const hoursError = activities.some(({ errorMessage }) =>
      errorMessage?.includes('How much time do you want to spend on')
      || errorMessage === 'There aren\'t enough hours in the day!'
      || errorMessage === 'You can\'t get more time!',
    );

    if (hoursError) {
      newHoursRef.current?.focus();
    } else {
      newLabelRef.current?.focus();
    }
  }, [activities]);

  function createActivity() {
    const newLabel = newLabelRef.current?.value.trim() ?? '';
    const newHours = newHoursRef.current?.value
      ? Number.parseFloat(newHoursRef.current.value)
      : null;

    if (!newLabel) {
      onAddActivity(
        { value: newHours, label: '' },
        'What activity do you want to add?',
      );
      return;
    }

    if (!newHours) {
      onAddActivity(
        { value: '', label: newLabel },
        `How much time do you want to spend on ${newLabel}?`,
      );
      return;
    }

    const existing = activities.find(
      (activity) =>
        activity.id !== '?'
        && activity.label.toLowerCase() === newLabel.toLowerCase(),
    );

    if (existing) {
      editHours(existing.id, existing.value + newHours);
      return;
    }

    if (newHours < 0) {
      onAddActivity(
        { value: newHours, label: newLabel },
        'You can\'t get more time!',
      );
      return;
    }

    const totalHours = activities
      .filter((activity) => !['?', 0].includes(activity.id))
      .reduce((total, activity) => total + activity.value, 0);

    if (totalHours + newHours > 24) {
      onAddActivity(
        { value: newHours, label: newLabel },
        'There aren\'t enough hours in the day!',
      );
      return;
    }

    const newId = Math.max(
      0,
      ...activities
        .filter((activity) => typeof activity.id === 'number')
        .map((activity) => activity.id),
    ) + 1;

    newLabelRef.current.value = '';
    newHoursRef.current.value = '';
    onAddActivity({ id: newId, value: newHours, label: newLabel });
  }

  function editLabel(activityId, newLabel) {
    const current = activities.find((activity) => activity.id === activityId);

    if (!current || newLabel === current.label) {
      return;
    }

    const existing = activities.find(
      (activity) =>
        activity.id !== activityId
        && activity.id !== '?'
        && activity.label.toLowerCase() === newLabel.toLowerCase(),
    );

    if (existing) {
      editHours(existing.id, existing.value + current.value, activityId);
      return;
    }

    onLabelEdit(activityId, newLabel);
  }

  function editHours(activityId, newHours, combinedId) {
    if (newHours < 0) {
      onHoursEdit(activityId, newHours, 'You can\'t get more time!');
      return;
    }

    const current = activities.find((activity) => activity.id === activityId);

    if (!current || newHours === current.value) {
      return;
    }

    const totalHours = activities
      .filter((activity) => !['?', 0].includes(activity.id))
      .reduce((total, activity) => total + activity.value, 0);

    if (totalHours - current.value + newHours > 24) {
      onHoursEdit(
        activityId,
        newHours,
        'There aren\'t enough hours in the day!',
      );
      return;
    }

    onHoursEdit(activityId, newHours, null, combinedId);
  }

  return (
    <table className={timeUnit}>
      <thead>
        <tr>
          <th>Activity</th>
          <th>Hours</th>
        </tr>
      </thead>
      <tbody>
        {activities.map((activity) => {
          if (activity.value === 0) {
            return null;
          }

          const isRemaining = activity.id === 0;
          const isNew = activity.id === '?';
          const inputClass = `${isNew ? 'new ' : ''}${timeUnit}`;
          const inputKey = `${activity.id}-${activity.label}-${activity.value}`;

          return (
            <Fragment key={activity.id}>
              <tr>
                <td className="activity">
                  {isRemaining ? (
                    <div>{activity.label}</div>
                  ) : (
                    <ActivityInput
                      key={`label-${inputKey}`}
                      id={`${id}${activity.id}`}
                      dataId={activity.id}
                      className={inputClass}
                      type="text"
                      placeholder="activity"
                      value={activity.label}
                      inputRef={isNew ? newLabelRef : undefined}
                      onBlur={editLabel}
                      onEnter={createActivity}
                    />
                  )}
                </td>
                <td className="hours">
                  {isRemaining ? (
                    <div className="empty-hours">{activity.value}</div>
                  ) : (
                    <ActivityInput
                      key={`hours-${inputKey}`}
                      id={`${id}${activity.id}`}
                      dataId={activity.id}
                      className={inputClass}
                      type="number"
                      placeholder="hours"
                      min="0.25"
                      max="24"
                      step="0.25"
                      value={activity.value}
                      inputRef={isNew ? newHoursRef : undefined}
                      onBlur={editHours}
                      onEnter={createActivity}
                    />
                  )}
                </td>
                <td>
                  {isNew ? (
                    <button title="Add activity" onClick={createActivity}>
                      Add
                    </button>
                  ) : !isRemaining ? (
                    <button
                      className="delete"
                      title="Remove activity"
                      onClick={() => onDeleteActivity(activity.id)}
                    >
                      x
                    </button>
                  ) : null}
                </td>
              </tr>
              {activity.errorMessage && (
                <tr>
                  <td colSpan="3" className="error">
                    {activity.errorMessage}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export default Table;

Table.propTypes = {
  id: PropTypes.number.isRequired,
  activities: PropTypes.arrayOf(activityPropType).isRequired,
  timeUnit: PropTypes.oneOf(['day', 'week', 'month']).isRequired,
  onLabelEdit: PropTypes.func.isRequired,
  onHoursEdit: PropTypes.func.isRequired,
  onAddActivity: PropTypes.func.isRequired,
  onDeleteActivity: PropTypes.func.isRequired,
};

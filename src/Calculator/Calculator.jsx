import { useMemo, useState } from 'react';
import { getDaysInMonth } from '../activities.js';
import { activitiesByDayPropType } from '../propTypes.js';
import './Calculator.css';

function aggregateActivities(activities) {
  const totals = new Map();

  Object.values(activities).forEach((dayActivities) => {
    dayActivities
      .filter((activity) => !['?', 0].includes(activity.id))
      .forEach((activity) => {
        const key = activity.label.toLowerCase();
        const existing = totals.get(key);

        if (existing) {
          existing.value += activity.value;
          existing.weight += 1;
        } else {
          totals.set(key, {
            label: activity.label,
            value: activity.value,
            color: activity.color,
            weight: 1,
          });
        }
      });
  });

  return [...totals.values()];
}

function Calculator({ activities }) {
  const [ageStart, setAgeStart] = useState(0);
  const [ageEnd, setAgeEnd] = useState(1);
  const [difference, setDifference] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const calculatedActivities = useMemo(
    () => aggregateActivities(activities),
    [activities],
  );
  const now = new Date();
  const monthDays = getDaysInMonth(now.getFullYear(), now.getMonth());

  function updateStartingAge(event) {
    if (event.target.value === '') {
      return;
    }

    const nextAge = Number.parseInt(event.target.value, 10);

    if (nextAge < 0) {
      setErrorMessage('You can\'t go back in time!');
      return;
    }

    setAgeStart(nextAge);
    setAgeEnd(nextAge + 1);
    setDifference(0);
    setErrorMessage('');
  }

  function updateEndingAge(event) {
    if (event.target.value === '') {
      return;
    }

    const nextAge = Number.parseInt(event.target.value, 10);
    const nextDifference = nextAge - ageStart;

    if (nextAge < 0 || nextDifference < 0) {
      setErrorMessage('You can\'t go back in time!');
      return;
    }

    setAgeEnd(nextAge);
    setDifference(nextDifference);
    setErrorMessage('');
  }

  const showResults =
    difference > 0 && !errorMessage && calculatedActivities.length > 0;

  return (
    <div id="calculator-container">
      <h3>
        I am&nbsp;
        <input
          id="age-start"
          type="number"
          placeholder="age"
          title="Enter your age"
          min="0"
          step="1"
          onBlur={updateStartingAge}
        />&nbsp;
        {ageStart === 1 ? 'year' : 'years'} old.&nbsp;
        If I live to be&nbsp;
        <input
          id="age-end"
          type="number"
          placeholder="age"
          title="Enter the age you would like to live to"
          min={ageEnd}
          step="1"
          onBlur={updateEndingAge}
        />, then I will spend...
      </h3>
      {errorMessage && <div className="error">{errorMessage}</div>}
      {showResults && (
        <table id="calculator">
          <thead>
            <tr>
              <th>Total</th>
              <th>Yearly</th>
              <th>Monthly</th>
              <th>Weekly</th>
            </tr>
          </thead>
          <tbody>
            {calculatedActivities.map((activity) => {
              const dailyAverage = activity.value / activity.weight;
              return (
                <tr key={activity.label.toLowerCase()}>
                  <td>
                    <div>
                      <b>
                        {Math.round(dailyAverage * difference * 365)
                          .toLocaleString()}
                      </b>{' '}
                      hours on{' '}
                      <b style={{ color: activity.color }}>{activity.label}</b>
                    </div>
                  </td>
                  <td>
                    <div>
                      {Math.round(dailyAverage * 365).toLocaleString()}
                    </div>
                  </td>
                  <td>
                    <div>
                      {Math.round(dailyAverage * monthDays).toLocaleString()}
                    </div>
                  </td>
                  <td>
                    <div>
                      {Math.round(dailyAverage * 7).toLocaleString()}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Calculator;

Calculator.propTypes = {
  activities: activitiesByDayPropType.isRequired,
};

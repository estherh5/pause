import React, { Component } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import './Table.css';
import ActivityInput from './ActivityInput.js';

// Table that contains inputs for each activity
class Table extends Component {
  constructor(props) {
    super(props);

    // Component identifier from App parent
    this.id = this.props.id;

    this.createActivity = this.createActivity.bind(this);
    this.editLabel = this.editLabel.bind(this);
    this.editHours = this.editHours.bind(this);
    this.deleteActivity = this.deleteActivity.bind(this);
  }

  /* Prevent updating of component if there are no changes to its activities
  array */
  shouldComponentUpdate(nextProps, nextState) {
    let newActivities = nextProps.activities;

    let prevActivities = this.props.activities;

    if (newActivities.length !== prevActivities.length) {
      return true;
    }

    /* Update component if there is a change in the activities' values, labels,
    or error message */
    for (const [index, activity] of newActivities.entries()) {
      let newItem = newActivities[index];
      let prevItem = prevActivities[index];

      if (nextProps.timeUnit !== this.props.timeUnit ||
        newItem.value !== prevItem.value ||
        newItem.label !== prevItem.label || (newItem.errorMessage &&
        newItem.errorMessage !== prevItem.errorMessage) ||
        (prevItem.errorMessage && newItem.errorMessage !==
        prevItem.errorMessage)) {
          return true;
        }
    }

    return false;
  }

  // Focus on new input field if it is rendered in component
  componentDidUpdate() {
    let currentActivities = this.props.activities;

    // Check if an hours error exists in activities array
    const hoursError = currentActivities.some(function(activity) {
      if (activity.errorMessage) {
        return activity.errorMessage
          .includes('How much time do you want to spend on') ||
          activity.errorMessage === 'There aren\'t enough hours in the day!'
          || activity.errorMessage === 'You can\'t get more time!';
      }
    })

    if (hoursError) {
      document.getElementById('number' + this.id + '?').focus();
    }

    else if (document.getElementById('text' + this.id + '?')) {
      return document.getElementById('text' + this.id + '?').focus();
    }

    return;
  }

  // Validate new activity input values when Add button is clicked
  createActivity() {
    let currentActivities = cloneDeep(this.props.activities);

    // Get input values for new activity
    const newLabel = document.getElementById('text' + this.id + '?').value
      .trim();
    let newHours;

    if (document.getElementById('number' + this.id + '?').value) {
      newHours = parseFloat(document.getElementById('number' + this.id + '?')
        .value, 10);
    } else {
      newHours = null;
    }

    // Display error if activity label is blank
    if (!newLabel) {
      const errorMessage = 'What activity do you want to add?';
      const newActivity = {value: newHours, label: ''};

      return this.props.onAddActivity(newActivity, errorMessage);
    }

    // Check if activity label already exists in activities array
    const activityExists = currentActivities.some(function(activity) {
      if (activity.id !== '?') {
        return activity.label.toLowerCase() === newLabel.toLowerCase();
      }
    })

    // Display error if activity label already exists
    if (activityExists) {
      const errorMessage = 'You already added ' + newLabel + '!';
      const newActivity = {value: newHours, label: newLabel};

      return this.props.onAddActivity(newActivity, errorMessage);
    }

    // Display error if activity hours value is blank
    if (!newHours) {
      const errorMessage = 'How much time do you want to spend on ' +
        newLabel + '?';
      const newActivity = {value: '', label: newLabel};

      return this.props.onAddActivity(newActivity, errorMessage);
    }

    // Display error if hours is negative number
    if (newHours < 0) {
      const errorMessage = 'You can\'t get more time!';
      const newActivity = {value: newHours, label: newLabel};

      return this.props.onAddActivity(newActivity, errorMessage);
    }

    /* Count total hours to see if 24 will be exceeded with the new hours
    value, excluding placeholders */
    let totalHours = 0;

    for (const activity of currentActivities) {
      if (!['?', 0].includes(activity.id)) {
        totalHours += activity.value;
      }
    }

    // Display error if 24 hours is exceeded with the new hours value
    if (totalHours + newHours > 24) {
      const errorMessage = 'There aren\'t enough hours in the day!';
      const newActivity = {value: newHours, label: newLabel};

      return this.props.onAddActivity(newActivity, errorMessage);
    }

    // Set new activity id to next numerical value in activities array
    const newId = currentActivities
      .reduce((max, obj) => obj.id > max ? obj.id : max,
      currentActivities[0].id) + 1;

    const newActivity = {id: newId, value: newHours, label: newLabel};

    return this.props.onAddActivity(newActivity);
  }

  // Validate label for existing activity when user edits it
  editLabel(activityId, newLabel) {
    let currentActivities = cloneDeep(this.props.activities);

    // Get index of edited activity in activities array
    const activityIndex = currentActivities
      .findIndex(obj => obj.id === activityId);

    // Get previous label for activity
    const oldLabel = currentActivities[activityIndex].label;

    // Do nothing if new labels is same as old label
    if (newLabel === oldLabel) {
      return;
    }

    // Check if activity label already exists in activities array
    const activityExists = currentActivities.some(function(activity) {
      if (activity.id !== '?') {
        return activity.label.toLowerCase() === newLabel.toLowerCase();
      }
    })

    // Display error if activity label already exists
    if (activityExists) {
      const errorMessage = 'You already added ' + newLabel + '!';

      return this.props.onLabelEdit(activityId, newLabel, errorMessage);
    }

    return this.props.onLabelEdit(activityId, newLabel);
  }

  // Validate hours value for existing activity when user edits it
  editHours(activityId, newHours) {
    let currentActivities = cloneDeep(this.props.activities);

    // Display error if hours is negative number
    if (newHours < 0) {
      const errorMessage = 'You can\'t get more time!';

      return this.props.onHoursEdit(activityId, newHours, errorMessage);
    }

    // Get index of edited activity in activities array
    const activityIndex = currentActivities
      .findIndex(obj => obj.id === activityId);

    // Get previous hours value for activity
    const oldHours = currentActivities[activityIndex].value;

    // Do nothing if new hours value is same as old hours value
    if (newHours === oldHours) {
      return;
    }

    /* Count total hours to see if 24 will be exceeded with the new hours
    value, excluding placeholders */
    let totalHours = 0;

    for (const activity of currentActivities) {
      if (!['?', 0].includes(activity.id)) {
        totalHours += activity.value;
      }
    }

    // Display error if 24 hours is exceeded with the new hours value
    if (totalHours - oldHours + newHours > 24) {
      const errorMessage = 'There aren\'t enough hours in the day!';

      return this.props.onHoursEdit(activityId, newHours, errorMessage);
    }

    return this.props.onHoursEdit(activityId, newHours);
  }

  // Delete activity when "X" button is clicked
  deleteActivity(e) {
    // Get activity id from data-id value and convert to number
    const activityId = parseInt(e.target.dataset.id, 10);

    return this.props.onDeleteActivity(activityId);
  }

  render() {
    /* Get current ISO string time to use in key for each table row to force
    re-rendering of values when activities array gets updated */
    const now = new Date();
    const stringTime = now.toISOString();

    return (
      <table className={this.props.timeUnit}>
        <thead>
          <tr>
            <th>Activity</th>
            <th>Hours</th>
          </tr>
        </thead>
        {this.props.activities.map(activity =>
          <tbody key={stringTime + activity.id}>
            <tr>
              {activity.value === 0 ? (null) : (
                activity.id === 0 ? (
                  <td className="activity">
                    <div>{activity.label}</div>
                  </td>
                ) : (
                  activity.id === '?' ? (
                    <td className="activity">
                      <ActivityInput
                        id={this.props.id + activity.id}
                        dataId={activity.id}
                        className={'new ' + this.props.timeUnit}
                        type="text"
                        placeholder="activity"
                        value={activity.label}
                        onBlur={this.editLabel} />
                    </td>
                  ) : (
                    <td className="activity">
                      <ActivityInput
                        id={this.props.id + activity.id}
                        dataId={activity.id}
                        className={this.props.timeUnit}
                        type="text"
                        placeholder="activity"
                        value={activity.label}
                        onBlur={this.editLabel} />
                    </td>
                  )
                )
              )}
              {activity.value === 0 ? (null) : (
                activity.id === 0 ? (
                  <td className="hours">
                    <div id="empty-hours">{activity.value}</div>
                  </td>
                ) : (
                  activity.id === '?' ? (
                    <td className="hours">
                      <ActivityInput
                        id={this.props.id + activity.id}
                        dataId={activity.id}
                        className={'new ' + this.props.timeUnit}
                        type="number"
                        placeholder="hours"
                        min="0.25"
                        max="24"
                        step="0.25"
                        value={activity.value}
                        onBlur={this.editHours} />
                    </td>
                  ) : (
                    <td className="hours">
                      <ActivityInput
                        id={this.props.id + activity.id}
                        dataId={activity.id}
                        className={this.props.timeUnit}
                        type="number"
                        placeholder="hours"
                        min="0.25"
                        max="24"
                        step="0.25"
                        value={activity.value}
                        onBlur={this.editHours} />
                    </td>
                  )
                )
              )}
              {activity.value === 0 ? (null) : (
                activity.id === 0 ? (
                  <td></td>
                ) : (
                  activity.id === '?' ? (
                    <td>
                      <button onClick={this.createActivity}>Add</button>
                    </td>
                  ) : (
                    <td>
                      <button className="delete" onClick={this.deleteActivity}
                        data-id={activity.id}>x</button>
                    </td>
                  )
                )
              )}
            </tr>
            <tr>
            {activity.errorMessage ? (
              <td colSpan="2" className="error">{activity.errorMessage}</td>
            ): (null)}
            </tr>
          </tbody>
        )}
      </table>
    );
  }
}

export default Table;

import React, { Component } from 'react';
import './Table.css';
import ActivityInput from './ActivityInput.js'

// Table that contains inputs for each activity
class Table extends Component {
  constructor(props) {
    super(props);

    this.createActivity = this.createActivity.bind(this);
    this.editLabel = this.editLabel.bind(this);
    this.editHours = this.editHours.bind(this);
    this.deleteActivity = this.deleteActivity.bind(this);
  }

  // Validate new activity input values when Add button is clicked
  createActivity(e) {
    let parentState = this.props;

    // Get input values for new activity
    const newLabel = document.getElementById('text?').value.trim();
    let newHours;

    if (document.getElementById('number?').value) {
      newHours = parseFloat(document.getElementById('number?').value, 10);
    } else {
      newHours = null;
    }

    // Display error if activity label is blank
    if (!newLabel) {
      const errorMessage = 'What activity do you want to add?';
      const newActivity = {value: newHours, label: ''};

      return this.props.onAddActivity(newActivity, errorMessage);
    }

    // Check if activity label already exists in activities list
    const activityExists = parentState.activities.some(function(activity) {
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

    for (const activity of parentState.activities) {
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
    const newId = parentState.activities
      .reduce((max, obj) => obj.id > max ? obj.id : max,
      parentState.activities[0].id) + 1;

    const newActivity = {id: newId, value: newHours, label: newLabel};

    return this.props.onAddActivity(newActivity);
  }

  // Validate label for existing activity when user edits it
  editLabel(activityId, newLabel) {
    let parentState = this.props;

    // Get index of edited activity in activities array
    const activityIndex = parentState.activities
      .findIndex((obj => obj.id === activityId));

    // Get previous label for activity
    const oldLabel = parentState.activities[activityIndex].label;

    // Do nothing if new labels is same as old label
    if (newLabel === oldLabel) {
      return;
    }

    // Check if activity label already exists in activities list
    const activityExists = parentState.activities.some(function(activity) {
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
    let parentState = this.props;

    // Display error if hours is negative number
    if (newHours < 0) {
      const errorMessage = 'You can\'t get more time!';

      return this.props.onHoursEdit(activityId, newHours, errorMessage);
    }

    // Get index of edited activity in activities array
    const activityIndex = parentState.activities
      .findIndex((obj => obj.id === activityId));

    // Get previous hours value for activity
    const oldHours = parentState.activities[activityIndex].value;

    // Do nothing if new hours value is same as old hours value
    if (newHours === oldHours) {
      return;
    }

    /* Count total hours to see if 24 will be exceeded with the new hours
    value, excluding placeholders */
    let totalHours = 0;

    for (const activity of parentState.activities) {
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
    re-rendering of values when activities list gets updated */
    const date = new Date();
    const stringTime = date.toISOString();

    return (
      <table>
        <thead>
          <tr>
            <th>Activity</th>
            <th>Hours</th>
          </tr>
        </thead>
        {this.props.activities.map((activity) =>
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
                        id={activity.id}
                        className="new"
                        type="text"
                        placeholder="activity"
                        value={activity.label}
                        onBlur={this.editLabel} />
                    </td>
                  ) : (
                    <td className="activity">
                      <ActivityInput
                        id={activity.id}
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
                        id={activity.id}
                        className="new"
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
                        id={activity.id}
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

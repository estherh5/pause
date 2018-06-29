import React, { Component } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import './DayData.css';
import Table from './Table.js';
import Chart from './Chart.js';

// Day component that contains table and chart for a single day's activities
class DayData extends Component {
  constructor(props) {
    super(props);

    // Component's id from App parent
    this.id = parseInt(this.props.id, 10);

    // List of days of the week to display if time unit is 'week'
    this.weeks = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
      'Friday', 'Saturday'];

    /* List of months to convert from current month number if time unit is
    'month' */
    this.months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    this.addActivity = this.addActivity.bind(this);
    this.updateLabel = this.updateLabel.bind(this);
    this.updateHours = this.updateHours.bind(this);
    this.removeActivity = this.removeActivity.bind(this);
  }

  // Focus on new input field after component gets mounted
  componentDidMount() {
    return document.getElementById('text0?').focus();
  }

  // Add activity to activities array or display error message
  addActivity(newActivity, errorMessage) {
    let currentActivities = cloneDeep(this.props.activities);

    // Get component's id
    const componentId = this.id;

    // Delete previous error messages
    for (const activity of currentActivities) {
      if (activity.errorMessage) {
        delete activity.errorMessage;
      }
    }

    // Get index of new activity in activities array
    const newIndex = currentActivities.findIndex(obj => obj.id === '?');

    // Get index of remaining hours activity in activities array
    const emptyIndex = currentActivities.findIndex(obj => obj.id === 0);

    /* Display error message for activity if input values are invalid (passed
    up from Table component) */
    if (errorMessage) {
      currentActivities[newIndex].errorMessage = errorMessage;
      currentActivities[newIndex].value = newActivity.value;
      currentActivities[newIndex].label = newActivity.label;

      return this.props.onActivitiesUpdate(componentId, currentActivities);
    }

    // Add new activity to activities array
    currentActivities.push(newActivity);

    // Decrement new activity's hours from remaining hours
    currentActivities[emptyIndex].value -= newActivity.value;

    /* If there are still hours remaining in the day, display inputs for new
    activity */
    if (currentActivities[emptyIndex].value > 0) {
      // Reset new activity input values
      currentActivities[newIndex].value = '';
      currentActivities[newIndex].label = '';

      /* Move new activity to end of activities array so it appears at the
      end of the Table component's inputs */
      currentActivities.push(currentActivities.splice(newIndex, 1)[0]);
    }

    /* If there are no hours left in the day, remove the new activity from the
    activities array so no empty inputs appear */
    else if (currentActivities[emptyIndex].value === 0) {
      currentActivities.splice(newIndex, 1);
    }

    return this.props.onActivitiesUpdate(componentId, currentActivities);
  }

  // Update activity label in activities array or display error message
  updateLabel(activityId, newLabel, errorMessage) {
    // If new label is blank, remove the activity from the array
    if (!newLabel) {
      return this.removeActivity(activityId);
    }

    let currentActivities = cloneDeep(this.props.activities);

    // Get component's id
    const componentId = this.id;

    // Delete previous error messages
    for (const activity of currentActivities) {
      if (activity.errorMessage) {
        delete activity.errorMessage;
      }
    }

    // Get index of edited activity in activities array
    const activityIndex = currentActivities
      .findIndex(obj => obj.id === activityId);

    /* Display error message for activity if label is invalid (passed up from
    Table component) */
    if (errorMessage) {
      currentActivities[activityIndex].errorMessage = errorMessage;

      return this.props.onActivitiesUpdate(componentId, currentActivities);
    }

    // Update activity label in activities array
    currentActivities[activityIndex].label = newLabel;

    return this.props.onActivitiesUpdate(componentId, currentActivities);
  }

  /* Update activity hours value in activities array and remove to-merge
  activity if user wants to combine activity with another, or display error
  message */
  updateHours(activityId, newHours, errorMessage, combinedId) {
    let currentActivities = cloneDeep(this.props.activities);

    // Get component's id
    const componentId = this.id;

    // Delete previous error messages
    for (const activity of currentActivities) {
      if (activity.errorMessage) {
        delete activity.errorMessage;
      }
    }

    // Get index of edited activity in activities array
    const activityIndex = currentActivities
      .findIndex(obj => obj.id === activityId);

    /* Display error message for activity if hours value is invalid (passed
    up from Table component) */
    if (errorMessage) {
      currentActivities[activityIndex].errorMessage = errorMessage;

      return this.props.onActivitiesUpdate(componentId, currentActivities);
    }

    // If new hours value is null or 0, remove activity from activities array
    if (!newHours || newHours === 0) {
      return this.removeActivity(activityId);
    }

    // Get index of remaining hours activity in activities array
    const emptyIndex = currentActivities.findIndex(obj => obj.id === 0);

    // Get index of new activity in activities array
    const newIndex = currentActivities.findIndex(obj => obj.id === '?');

    // Remove activity that is getting combined with current activity
    if (combinedId) {
      currentActivities.splice(combinedId, 1);
    }

    // Remove updated hours from remaining hours for net-new hours values
    else {
      // Get previous hours value for activity
      const oldHours = currentActivities[activityIndex].value;

      // Increment difference in updated activity's hours from remaining hours
      currentActivities[emptyIndex].value += (oldHours - newHours);
    }

    // Update activity hours value in activities array
    currentActivities[activityIndex].value = newHours;

    /* If there are still hours remaining in the day and empty input values for
    new activity are not already displayed, add input values for new
    activity */
    if (currentActivities[emptyIndex].value > 0 && newIndex === -1) {
      currentActivities.push({id: '?', value: '', label: ''});
    }

    /* If there are no hours left in the day and empty input values for
    new activity are displayed, remove the new activity from the activities
    array so no empty inputs appear */
    else if (currentActivities[emptyIndex].value === 0 && newIndex !== -1) {
      currentActivities.splice(newIndex, 1);
    }

    return this.props.onActivitiesUpdate(componentId, currentActivities);
  }

  // Remove activity from activities array
  removeActivity(activityId) {
    let currentActivities = cloneDeep(this.props.activities);

    // Get component's id
    const componentId = this.id;

    // Delete previous error messages
    for (const activity of currentActivities) {
      if (activity.errorMessage) {
        delete activity.errorMessage;
      }
    }

    // Get index of activity in activities array
    const activityIndex = currentActivities
      .findIndex(obj => obj.id === activityId);

    // Get current hours value for activity
    const activityHours = currentActivities[activityIndex].value;

    // Get index of remaining hours activity in activities array
    const emptyIndex = currentActivities.findIndex(obj => obj.id === 0);

    // Get index of new activity in activities array
    const newIndex = currentActivities.findIndex(obj => obj.id === '?');

    // Increment activity's hours from remaining hours
    currentActivities[emptyIndex].value += activityHours;

    // Remove activity from activities array
    currentActivities.splice(activityIndex, 1);

    /* If there are still hours remaining in the day and empty input values for
    new activity are not already displayed, add input values for new
    activity */
    if (currentActivities[emptyIndex].value > 0 && newIndex === -1) {
      currentActivities.push({id: '?', value: '', label: ''});
    }

    return this.props.onActivitiesUpdate(componentId, currentActivities);
  }

  render() {
    // Get current month number
    const now = new Date();

    const monthNumber = now.getMonth();

    return (
      <div className={'day-container ' + this.props.timeUnit}>
        {this.props.timeUnit === 'week' ? (
          <h3 className="day-header">{this.weeks[this.props.id]}</h3>
        ) : (
          this.props.timeUnit === 'month' ? (
            <h3 className="day-header">
              {this.months[monthNumber] + ' ' +
                (parseInt(this.props.id, 10) + 1)}
            </h3>
          ) : (null)
        )}
        <div className={'data-container ' + this.props.timeUnit}>
          <Table
            id={this.props.id}
            activities={this.props.activities}
            timeUnit={this.props.timeUnit}
            onLabelEdit={this.updateLabel}
            onHoursEdit={this.updateHours}
            onAddActivity={this.addActivity}
            onDeleteActivity={this.removeActivity} />
          <Chart
            id={this.props.id}
            timeUnit={this.props.timeUnit}
            activities={this.props.activities} />
        </div>
      </div>
    );
  }
}

export default DayData;

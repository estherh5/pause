import React, { Component } from 'react';
import './App.css';
import Please from './Please.js';
import Header from './Header.js'
import Table from './Table.js'
import Chart from './Chart.js'
import StarterButtons from './StarterButtons.js'

// Main app that contains all components
class App extends Component {
  constructor() {
    super();

    /* Starting state that contains activity placeholders for remaining hours
    in the day (24) and empty new activity */
    this.state = {
      activities: [
        {id: 0, value: 24, label: '', color: '#DCDCDC'},
        {id: '?', value: '', label: ''}
      ]
    };

    this.addActivity = this.addActivity.bind(this);
    this.updateLabel = this.updateLabel.bind(this);
    this.updateHours = this.updateHours.bind(this);
    this.removeActivity = this.removeActivity.bind(this);
    this.replaceActivities = this.replaceActivities.bind(this);
    this.setColors = this.setColors.bind(this);
  }

  // Add activity to activities array
  addActivity(newActivity, errorMessage) {
    let currentActivities = this.state.activities;

    // Delete previous error messages
    for (const activity of currentActivities) {
      if (activity.errorMessage) {
        delete activity.errorMessage;
      }
    }

    // Get index of new activity in activities array
    const newIndex = currentActivities
      .findIndex((obj => obj.id === '?'));

    // Get index of remaining hours activity in activities array
    const emptyIndex = currentActivities
      .findIndex((obj => obj.id === 0));

    /* Display error message for activity if input values are invalid (passed
    up from Table component) */
    if (errorMessage) {
      currentActivities[newIndex].errorMessage = errorMessage;
      currentActivities[newIndex].value = newActivity.value;
      currentActivities[newIndex].label = newActivity.label;

      return this.setColors(currentActivities);
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

    return this.setColors(currentActivities);
  }

  // Update activity label in activities array
  updateLabel(activityId, newLabel, errorMessage) {
    // If new label is blank, remove the activity from the array
    if (!newLabel) {
      return this.removeActivity(activityId);
    }

    let currentActivities = this.state.activities;

    // Delete previous error messages
    for (const activity of currentActivities) {
      if (activity.errorMessage) {
        delete activity.errorMessage;
      }
    }

    // Get index of edited activity in activities array
    const activityIndex = currentActivities
      .findIndex((obj => obj.id === activityId));

    /* Display error message for activity if label is invalid (passed up from
    Table component) */
    if (errorMessage) {
      currentActivities[activityIndex].errorMessage = errorMessage;

      return this.setColors(currentActivities);
    }

    // Update activity label in activities array
    currentActivities[activityIndex].label = newLabel;

    return this.setColors(currentActivities);
  }

  // Update activity hours value in activities array
  updateHours(activityId, newHours, errorMessage) {
    let currentActivities = this.state.activities;

    // Delete previous error messages
    for (const activity of currentActivities) {
      if (activity.errorMessage) {
        delete activity.errorMessage;
      }
    }

    // Get index of edited activity in activities array
    const activityIndex = currentActivities
      .findIndex((obj => obj.id === activityId));

    /* Display error message for activity if hours value is invalid (passed
    up from Table component) */
    if (errorMessage) {
      currentActivities[activityIndex].errorMessage = errorMessage;

      return this.setColors(currentActivities);
    }

    // If new hours value is null or 0, remove activity from activities array
    if (!newHours || newHours === 0) {
      return this.removeActivity(activityId);
    }

    // Get index of remaining hours activity in activities array
    const emptyIndex = currentActivities.findIndex((obj => obj.id === 0));

    // Get index of new activity in activities array
    const newIndex = currentActivities.findIndex((obj => obj.id === '?'));

    // Get previous hours value for activity
    const oldHours = currentActivities[activityIndex].value;

    // Increment difference in updated activity's hours from remaining hours
    currentActivities[emptyIndex].value += (oldHours - newHours);

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

    return this.setColors(currentActivities);
  }

  // Remove activity from activities array
  removeActivity(activityId) {
    let currentActivities = this.state.activities;

    // Get index of activity in activities array
    const activityIndex = currentActivities
      .findIndex((obj => obj.id === activityId));

    // Get current hours value for activity
    const activityHours = currentActivities[activityIndex].value;

    // Get index of remaining hours activity in activities array
    const emptyIndex = currentActivities.findIndex((obj => obj.id === 0));

    // Get index of new activity in activities array
    const newIndex = currentActivities.findIndex((obj => obj.id === '?'));

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

    return this.setColors(currentActivities);
  }

  // Replace activities array with passed array
  replaceActivities(activities) {
    let currentActivities = this.state.activities;

    /* Remove current values from activities array and replace it with passed
    activities array */
    currentActivities.splice(0, currentActivities.length, ...activities);

    return this.setColors(currentActivities);
  }

  // Set color for each activity for display in chart and calculator
  setColors(activities) {
    // Set base color to make a color palette from
    const base_color = Please.make_color({
      saturation: 1,
      value: 1,
      golden: true,
      format: 'hsv'
    });

    // Create color palette
    const colors = Please.make_scheme(base_color[0],
      {scheme_type: 'analogous'}, activities.length - 1);

    // Add color to each activity in activities array, excluding placeholders
    activities = activities.map(function (activity) {
      if (!['?', 0].includes(activity.id)) {
        activity.color = colors[activity.id - 1];

        return activity;
      }

      return activity;
    });

    return this.setState({activities: activities});
  }

  render() {
    return (
      <div>
        <Header />
        <div id="app-container">
          <h1 id="title">
            <a href=".">Pause</a>
          </h1>
          <h2 id="subtitle">How do you want to spend your day?</h2>
          <div id="data-container">
            <Table
              activities={this.state.activities}
              onLabelEdit={this.updateLabel}
              onHoursEdit={this.updateHours}
              onAddActivity={this.addActivity}
              onDeleteActivity={this.removeActivity} />
            <Chart activities={this.state.activities} />
          </div>
          <div id="button-container">
            <StarterButtons onButtonClick={this.replaceActivities} />
          </div>
        </div>
      </div>
    );
  }
}

export default App;

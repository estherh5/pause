import React, { Component } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import './App.css';
import Please from './Please.js';
import Header from './Header.js';
import DayData from './DayData.js';
import StarterButtons from './StarterButtons.js';
import Calculator from './Calculator.js';

// Main app that contains all components
class App extends Component {
  constructor() {
    super();

    /* Starting state that contains activity placeholders for remaining hours
    in the day (24) and empty new activity, as well as starting time unit */
    this.state = {
      activities: {
        0: [
          {id: 0, value: 24, label: '', color: '#DCDCDC'},
          {id: '?', value: '', label: ''}
        ]
      },
      timeUnit: 'day'
    };

    // Set starting activities for new day
    this.startingActivities = [
      {id: 0, value: 24, label: '', color: '#DCDCDC'},
      {id: '?', value: '', label: ''}
    ]

    this.setTimeUnit = this.setTimeUnit.bind(this);
    this.updateActivities = this.updateActivities.bind(this);
    this.replaceActivities = this.replaceActivities.bind(this);
  }

  // Focus on new input field after component gets mounted
  componentDidMount() {
    return document.getElementById('text0?').focus();
  }

  // Set time unit to enter data for based on user's selection
  setTimeUnit(e) {
    const timeUnit = e.target.options[e.target.selectedIndex].text;

    // Set number of DayData components to be rendered based on time unit
    let componentRange;

    // Set number of components to 7 for week
    if (timeUnit === 'week') {
      componentRange = [...Array(7).keys()];
    }

    // Set number of components to length of month for month
    else if (timeUnit === 'month') {
      const now = new Date();

      // Get number of days in current month
      const monthDays = new Date((now).getFullYear(), now.getMonth() - 1, 0)
        .getDate();

      componentRange = [...Array(monthDays).keys()];
    }

    else {
      componentRange = [0];
    }

    /* Create starting activities array for each DayData component that will be
    rendered */
    let newActivities = {};

    componentRange
      .map(i => newActivities[i] = this.startingActivities);

    return this.setState({timeUnit: timeUnit, activities: newActivities});
  }

  // Update specified component's activities in activities object
  updateActivities(componentId, activities) {
    let currentActivities = cloneDeep(this.state.activities);

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

    // Update specified component's activities in activities object
    currentActivities[componentId] = activities;

    return this.setState({activities: currentActivities});
  }

  // Replace all components' activities data with specified activities
  replaceActivities(activities) {
    let currentActivities = cloneDeep(this.state.activities);

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

    // Replace all components' activities data with specified activities
    Object.keys(currentActivities)
      .forEach(i => currentActivities[i] = activities);

    return this.setState({activities: currentActivities});
  }

  render() {
    return (
      <div>
        <Header />
        <div id="app-container">
          <h1 id="title">
            <a href="." title="Pause">Pause</a>
          </h1>
          <h2 id="subtitle">
            How do you want to spend your&nbsp;
              <select title="Toggle time period" onChange={this.setTimeUnit}>
                <option>day</option>
                <option>week</option>
                <option>month</option>
              </select>
            ?
          </h2>
          <div id="day-data-container">
          {Object.keys(this.state.activities).map((item, index) =>
            <DayData
              key={index + this.state.timeUnit}
              id={index}
              activities={this.state.activities[index]}
              timeUnit={this.state.timeUnit}
              onActivitiesUpdate={this.updateActivities} />
          )}
          </div>
          <div id="button-container">
            <StarterButtons onButtonClick={this.replaceActivities} />
          </div>
          <Calculator activities={this.state.activities} />
        </div>
      </div>
    );
  }
}

export default App;

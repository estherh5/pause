import React, { Component } from 'react';
import axios from 'axios';
import cloneDeep from 'lodash/cloneDeep';
import './App.css';
import Please from './Please.js';
import Modal from './Modal/Modal.js';
import Header from './Header/Header.js';
import DayData from './DayData/DayData.js';
import StarterButtons from './StarterButtons/StarterButtons.js';
import Calculator from './Calculator/Calculator.js';

// Main app that contains all components
class App extends Component {
  constructor() {
    super();

    /* Starting state that contains activity placeholders for remaining hours
    in the day (24) and empty new activity, as well as starting time unit,
    month and year, and modal status and message */
    this.state = {
      activities: {
        0: [
          {id: 0, value: 24, label: '', color: '#DCDCDC'},
          {id: '?', value: '', label: ''}
        ]
      },
      chartTypes: {
        0: 'pie'
      },
      timeUnit: 'day',
      month: null,
      year: null,
      displayModal: false,
      serverStatus: null,
      modalMessage: null,
      modalLink: null
    };

    // Set starting activities for new day
    this.startingActivities = [
      {id: 0, value: 24, label: '', color: '#DCDCDC'},
      {id: '?', value: '', label: ''}
    ]

    /* List of months to convert from current month number if time unit is
    'month' */
    this.months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    this.getData = this.getData.bind(this);
    this.hideModal = this.hideModal.bind(this);
    this.setTimeUnit = this.setTimeUnit.bind(this);
    this.toggleMonth = this.toggleMonth.bind(this);
    this.updateActivities = this.updateActivities.bind(this);
    this.updateChartType = this.updateChartType.bind(this);
    this.replaceActivities = this.replaceActivities.bind(this);
    this.postData = this.postData.bind(this);
  }

  /* Load activities data from server if activities query param is present or
  focus on new input field after component gets mounted */
  componentDidMount() {
    // Get data id from URL activities query param
    const dataId = window.location.search.split('activities=')[1];

    if (dataId) {
      return this.getData(dataId);
    }

    return document.getElementById('text0?').focus();
  }

  // Load activities data from server for specified data id
  getData(dataId) {
    axios.get('https://pause-api.appspot.com/api/pause/activities/' + dataId)
      .then(res => {
        const data = res.data;

        // Select time unit from dropdown menu
        document.getElementById('select-time-unit').value = data['time_unit'];

        return this.setState({activities: data['activities'],
          chartTypes: data['chart_types'], timeUnit: data['time_unit'],
          month: data['month'], year: data['year']});
      })
  }

  hideModal() {
    return this.setState({displayModal: false});
  }

  // Set time unit to enter data for based on user's selection
  setTimeUnit(e) {
    const timeUnit = e.target.options[e.target.selectedIndex].text;

    // Set month if time unit is 'month'
    let month;

    // Set year if time unit is 'month'
    let year;

    // Set number of DayData components to be rendered based on time unit
    let componentRange;

    // Set number of components to 7 for week
    if (timeUnit === 'week') {
      componentRange = [...Array(7).keys()];
    }

    // Set number of components to length of month for month
    else if (timeUnit === 'month') {
      const now = new Date();

      // Get current month
      const monthNumber = now.getMonth();
      month = this.months[monthNumber];

      // Get number of days in current month
      const monthDays = new Date((now).getFullYear(), monthNumber + 1, 0)
        .getDate();

      // Get current year
      year = now.getFullYear();

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

    /* Create starting chart type object for each DayData component that will
    be rendered */
    let newChartTypes = {};

    componentRange.map(i => newChartTypes[i] = 'pie');

    return this.setState({timeUnit: timeUnit, month: month, year: year,
      activities: newActivities, chartTypes: newChartTypes});
  }

  toggleMonth(e) {
    let currentYear = this.state.year;

    let currentMonth = this.state.month;

    let newMonth;

    let newMonthNumber;

    let newYear;

    // Get index of month in months array
    let monthIndex = this.months.findIndex(month => month === currentMonth);

    // If user clicked "<" button, get previous month
    if (e.target.dataset.direction === 'decrement') {
      /* If current month is first month of the year, get previous year's last
      month */
      if (monthIndex === 0) {
        newYear = currentYear - 1;
        newMonthNumber = this.months.length - 1;
        newMonth = this.months[newMonthNumber];
      }

      else {
        newYear = currentYear;
        newMonthNumber = monthIndex - 1;
        newMonth = this.months[newMonthNumber];
      }
    }

    // Otherwise, get next month
    else {
      /* If current month is last month of the year, get next year's first
      month */
      if (monthIndex === this.months.length - 1) {
        newYear = currentYear + 1;
        newMonthNumber = 0;
        newMonth = this.months[newMonthNumber];
      }

      else {
        newYear = currentYear;
        newMonthNumber = monthIndex + 1;
        newMonth = this.months[newMonthNumber];
      }
    }

    // Get number of days in month
    const monthDays = new Date(newYear, newMonthNumber + 1, 0).getDate();

    /* Set number of DayData components to be rendered based on number of days
    in month */
    const componentRange = [...Array(monthDays).keys()];

    /* Create starting activities array for each DayData component that will be
    rendered */
    let newActivities = {};

    componentRange
      .map(i => newActivities[i] = this.startingActivities);

    /* Create starting chart type object for each DayData component that will
    be rendered */
    let newChartTypes = {};

    componentRange.map(i => newChartTypes[i] = 'pie');

    return this.setState({month: newMonth, year: newYear,
      activities: newActivities, chartTypes: newChartTypes});
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

  // Update chart type in chart types array
  updateChartType(componentId, newChartType) {
    let currentChartTypes = cloneDeep(this.state.chartTypes);

    // Update chart type in chart types array
    currentChartTypes[componentId] = newChartType;

    return this.setState({chartTypes: currentChartTypes});
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

  // Post activities data to server and get shareable URL for data
  postData() {
    const data = {
      activities: this.state.activities,
      chartTypes: this.state.chartTypes,
      timeUnit: this.state.timeUnit,
      month: this.state.month,
      year: this.state.year
    };

    axios.post('https://pause-api.appspot.com/api/pause/activities', data)
      .then(res => {
        return this.setState({displayModal: true, serverStatus: 'success',
          modalMessage: 'You can view your activities here:',
          modalLink: window.location.origin + '/?activities=' + res.data});
      })
      .catch(error => {
        return this.setState({displayModal: true, serverStatus: 'fail',
          modalMessage: 'Your activities could not be saved. Please try ' +
          'again soon.', modalLink: null});
      })
  }

  render() {
    return (
      <div id="main-container">
        <Modal
          display={this.state.displayModal}
          status={this.state.serverStatus}
          message={this.state.modalMessage}
          link={this.state.modalLink}
          onCloseModal={this.hideModal} />
        <Header />
        <div id="app-container">
          <h1 id="title">
            <a href="." title="Pause">Pause</a>
          </h1>
          <h2 id="subtitle">
            How do you want to spend your&nbsp;
              <select id="select-time-unit"
                title="Toggle time period"
                onChange={this.setTimeUnit}>
                  <option>day</option>
                  <option>week</option>
                  <option>month</option>
              </select>
            ?
          </h2>
          {this.state.timeUnit === 'month' ? (
            <div id="month-toggle">
              <button
                title="Toggle month"
                data-direction="decrement"
                onClick={this.toggleMonth}>
                  <i
                    className="fas fa-chevron-left"
                    data-direction="decrement"></i>
              </button>
              <h2 id="month">{this.state.month + ' ' + this.state.year}</h2>
              <button
                title="Toggle month"
                data-direction="increment"
                onClick={this.toggleMonth}>
                <i
                  className="fas fa-chevron-right"
                  data-direction="increment"></i>
              </button>
            </div>
          ) : (null)}
          <div id="day-data-container">
          {Object.keys(this.state.activities).map((item, index) =>
            <DayData
              key={index + this.state.timeUnit + this.state.month}
              id={index}
              activities={this.state.activities[index]}
              chartType={this.state.chartTypes[index]}
              timeUnit={this.state.timeUnit}
              month={this.state.timeUnit === 'month' ? (this.state.month) :
                (null)}
              onActivitiesUpdate={this.updateActivities}
              onChartTypeEdit={this.updateChartType} />
          )}
          </div>
          <div id="button-container">
            <StarterButtons onButtonClick={this.replaceActivities} />
          </div>
          <div id="save-container">
            <button id="save" onClick={this.postData}>Save</button>
          </div>
          <Calculator activities={this.state.activities} />
        </div>
      </div>
    );
  }
}

export default App;

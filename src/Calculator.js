import React, { Component } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import './Calculator.css';

// Table that generates calculations based on user's age and activities
class Calculator extends Component {
  constructor(props) {
    super(props);

    // Starting state that contains starting age and ending age
    this.state = {
      ageStart: 0,
      ageEnd: 1
    }

    this.setAge = this.setAge.bind(this);
    this.setDifference = this.setDifference.bind(this);
  }

  // Set user's age after it is entered in input field
  setAge(e) {
    // Do nothing if input is empty
    if (!e.target.value) {
      return;
    }

    const ageStart = parseInt(e.target.value, 10);

    if (ageStart < 0) {
      const errorMessage = 'You can\'t go back in time!';

      return this.setState({errorMessage: errorMessage});
    }

    // Remove previous error message
    delete this.state.errorMessage;

    // Set min value for ending age input
    const ageEnd = ageStart + 1;

    return this.setState({ageStart: ageStart, ageEnd: ageEnd});
  }

  // Set difference between user's starting and ending ages
  setDifference(e) {
    // Do nothing if input is empty
    if (!e.target.value) {
      return;
    }

    const ageStart = this.state.ageStart;
    const ageEnd = parseInt(e.target.value, 10);
    const difference = ageEnd - ageStart;

    if (ageEnd < 0 || difference < 0) {
      const errorMessage = 'You can\'t go back in time!';

      return this.setState({errorMessage: errorMessage});
    }

    // Remove previous error message
    delete this.state.errorMessage;

    return this.setState({ageEnd: ageEnd, difference: difference});
  }

  render() {
    /* Get current ISO string time to use in key for each table row to force
    re-rendering of values when activities list gets updated */
    const now = new Date();
    const stringTime = now.toISOString();

    // Get number of days in current month
    const monthDays = new Date((now).getFullYear(), now.getMonth() - 1, 0)
      .getDate();

    let currentActivities = cloneDeep(this.props.activities);

    // Create activities array for calculations
    let calculatedActivities = [];

    let newId = 0;

    /* Create weight variable that represents how many days' worth of data a
    labels/value pair represents in the calculatedActivities array */
    let weight = 1;

    /* Iterate through all components' activities in parent state to add unique
    activities to calculatedActivities array */
    for (const i in currentActivities) {
      /* Filter out activities that have not been added yet and remaining hours
      activity placeholder */
      currentActivities[i] = currentActivities[i].filter(activity => !['?', 0]
        .includes(activity.id));

      let labels = currentActivities[i].map(activity => activity.label);
      let hours = currentActivities[i].map(activity => activity.value);
      let colors = currentActivities[i].map(activity => activity.color);

      for (const [index, item] of labels.entries()) {
        // Check if activity label already exists in calculatedActivities array
        let activityExists = calculatedActivities.some(function(activity) {
          return activity.label.toLowerCase() === item.toLowerCase();
        });

        // If label does not exist, add activity to array
        if (!activityExists) {
          calculatedActivities.push({id: newId, label: item,
            value: hours[index], color: colors[index], weight: weight});

          // Increment newId for next activity that will be added to array
          newId++;
        }

        // If label already exists, increment its hours and weight values
        else {
          // Get label's index in calculatedActivities array
          let activityIndex = calculatedActivities.findIndex(activity =>
            activity.label.toLowerCase() === item.toLowerCase());

          // Add hours to activity
          calculatedActivities[activityIndex].value += hours[index];

          // Increment weight to represent another days' worth of data
          calculatedActivities[activityIndex].weight++;
        }
      }
    }

    return (
      <div id="calculator-container">
        <h3>
          I am&nbsp;
          <input
            id="age-start"
            type="number"
            min="0"
            step="1"
            onBlur={this.setAge} />&nbsp;
          {this.state.ageStart === 1 ? ('year') : ('years')} old.&nbsp;
          If I live to be&nbsp;
          <input
            id="age-end"
            type="number"
            min={this.state.ageEnd}
            step="1"
            onBlur={this.setDifference} />, then I will spend...
        </h3>
        {this.state.errorMessage ? (
          <div className="error">{this.state.errorMessage}</div>
        ): (null)}
        {!this.state.difference || this.state.errorMessage ||
          calculatedActivities.length < 1 ? (null) : (
            <table id="calculator">
              <thead>
                <tr>
                  <th>Total</th>
                  <th>Yearly</th>
                  <th>Monthly</th>
                  <th>Weekly</th>
                </tr>
              </thead>
              {calculatedActivities.map(activity =>
                <tbody key={stringTime + activity.id}>
                  <tr>
                    <td>
                      <div>
                        <b>
                          {Math.round(activity.value / activity.weight *
                            this.state.difference * 365).toLocaleString()}
                        </b> hours on <b style={{color: activity.color}}>
                          {activity.label}</b>
                      </div>
                    </td>
                    <td>
                      <div>
                        {Math.round(activity.value / activity.weight * 365)
                          .toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <div>
                        {Math
                          .round(activity.value / activity.weight * monthDays)
                          .toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <div>
                        {Math.round(activity.value / activity.weight * 7)
                          .toLocaleString()}
                      </div>
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          )}
      </div>
    );
  }
}

export default Calculator;

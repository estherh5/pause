import React, { Component } from 'react';
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

    /* Filter out activities that have not been added yet and remaining hours
    activity placeholder */
    const activities = this.props.activities
      .filter(activity => !['?', 0].includes(activity.id));

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
          activities.length < 1 ? (null) : (
            <table id="calculator">
              <thead>
                <tr>
                  <th>Total</th>
                  <th>Yearly</th>
                  <th>Monthly</th>
                  <th>Weekly</th>
                </tr>
              </thead>
              {activities.map((activity) =>
                <tbody key={stringTime + activity.id}>
                  <tr>
                    <td>
                      <div>
                        <b>
                          {activity.value * this.state.difference * 365}
                        </b> hours on <b style={{color: activity.color}}>
                          {activity.label}</b>
                      </div>
                    </td>
                    <td>
                      <div>{activity.value * 365}</div>
                    </td>
                    <td>
                      <div>{activity.value * monthDays}</div>
                    </td>
                    <td>
                      <div>{activity.value * 7}</div>
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

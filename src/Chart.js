import React, { Component } from 'react';
import './Chart.css';
import Please from './Please.js';
import {Pie, defaults} from 'react-chartjs-2';

// Set default chart font
defaults.global.defaultFontFamily = 'Raleway';

// Pie chart that displays activities data
class Chart extends Component {
  // Prevent rendering of component if there is an error in the activities data
  shouldComponentUpdate(nextProps, nextState) {
    for (const activity of nextProps.activities) {
      if (activity.errorMessage) {
        return false;
      }
    }

    return true;
  }

  render() {
    /* Filter out activities that have not been added yet or have no hours
    value (i.e., the remaining hours activity placeholder if no hours are left
    in the day) */
    const activities = this.props.activities
      .filter(activity => activity.id !== '?' && activity.value !== 0);

    let labels = activities.map(function (obj) {
      return obj.label;
    });

    let hours = activities.map(function (obj) {
      return obj.value;
    });

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

    // Add starting value for empty activity to color palette
    colors.unshift(activities[0].color);

    const chartData = {
      labels: labels,
      datasets: [{data: hours, backgroundColor: colors}]
    };

    // Set divider width between chart slices
    let borderWidth;

    // Hide divider if there is only one activity in the chart
    if (activities.length < 3) {
      borderWidth = 0;
    }

    // Otherwise, set divider width to 0.9
    else {
      borderWidth = 0.9;
    }

    /* Set chart options to hide legend, resize chart, and set divider width
    between chart slices */
    const chartOptions = {
      legend: {display: false},
      responsive: true,
      maintainAspectRatio: false,
      elements: {
        arc: {
          borderWidth: borderWidth
        }
      }
    };

    return (
      <div id="pie-container">
        <Pie data={chartData} options={chartOptions} />
      </div>
    );
  }
}

export default Chart;

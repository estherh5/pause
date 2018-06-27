import React, { Component } from 'react';
import './Chart.css';
import { Pie, Bar, Radar, Doughnut, defaults } from 'react-chartjs-2';

// Set default chart font
defaults.global.defaultFontFamily = 'Raleway';

// Chart that displays activities data
class Chart extends Component {
  constructor(props) {
    super(props);

    // Set starting state to pie chart
    this.state = {
      chartType: 'pie'
    }

    // Set available chart types
    this.chartTypes = [
      'pie', 'bar', 'radar', 'doughnut'
    ]

    this.setChartType = this.setChartType.bind(this);
  }

  // Prevent rendering of component if there is an error in the activities data
  shouldComponentUpdate(nextProps, nextState) {
    if (nextState.chartType === this.state.chartType) {
      for (const activity of nextProps.activities) {
        if (activity.errorMessage) {
          return false;
        }
      }
    }

    return true;
  }

  // Set chart type based off of button clicked
  setChartType(e) {
    const type = e.target.dataset.type;

    // Do nothing if type is not in available list of chart types
    if (!this.chartTypes.includes(type)) {
      return;
    }

    // Set currently selected button to unselected
    document.getElementsByClassName('selected')[0].classList
      .remove('selected');

    // Set clicked button to selected
    document.getElementById(type).classList.add('selected');

    return this.setState({chartType: type});
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

    let colors = activities.map(function (obj) {
      return obj.color;
    });

    // Set data for all chart types
    let chartData = {
      labels: labels,
      datasets: [{data: hours, backgroundColor: colors}]
    };

    // Set chart options for all chart types
    let chartOptions = {
      legend: {display: false},  // Hide legend
      responsive: true,  // Resize chart to fit container
      maintainAspectRatio: false,  // Don't require aspect ratio when resizing
      tooltips: {
        callbacks: {
          title: function(tooltipItem, data) {
            return;  // Don't display title in tooltip
          },
          label: function(tooltipItem, data) {
            const chartDataset = data.datasets[tooltipItem.datasetIndex];

            const currentLabel = labels[tooltipItem.index];

            const currentValue = chartDataset.data[tooltipItem.index];

            /* Set percentage for current value based on number of hours in
            day, rounding to nearest whole number */
            const percentage = Math.round((currentValue/24) * 100);

            let label;

            /* Set tooltip label to display number of hours and percentage only
            for remaining hours activity placeholder */
            if (!currentLabel) {
              label = ' ' + currentValue + ' hours (' + percentage + "%)";
            }

            /* Set tooltip label to display label, number of hours, and
            percentage otherwise */
            else {
              label = ' ' + currentLabel + ': ' + currentValue + ' hours (' +
                percentage + "%)";
            }

            return label;
          }
        }
      }
    };

    // Set pie and doughnut chart options
    if (['pie', 'doughnut'].includes(this.state.chartType)) {
      // Set divider width between slices for pie and doughnut charts
      let borderWidth;

      // Hide divider if there is only one activity in the chart
      if (activities.length < 2) {
        borderWidth = 0;
      }

      // Otherwise, set divider width to 0.9
      else {
        borderWidth = 0.9;
      }

      chartOptions['elements'] = {
        arc: {
          borderWidth: borderWidth
        }
      };
    }

    // Set bar chart options
    else if (this.state.chartType === 'bar') {
      // Get max hours value in activities array to set as max value for y-axis
      const maxValue = activities
        .reduce((max, activity) => activity.value > max ? activity.value : max,
          activities[0].value);

      chartOptions.scales = {
        yAxes: [{
          ticks: {
            beginAtZero: true,  // Set starting value to 0 on y-axis
            max: maxValue
          }
        }],
        xAxes: [{
          ticks: {
            autoSkip: false  // Display all x-axis labels
          }
        }]
      };
    }

    // Set radar chart options
    else if (this.state.chartType === 'radar') {
      // Set point background color for chart data instead of background color
      chartData.datasets = [{data: hours, pointBackgroundColor: colors}];

      // Get max hours value in activities array to set as max value for y-axis
      const maxValue = activities
        .reduce((max, activity) => activity.value > max ? activity.value : max,
          activities[0].value);

      chartOptions.scale = {
        ticks: {
          beginAtZero: true,  // Set starting value to 0 on y-axis
          max: maxValue
        }
      };
    }

    return (
      <div id="chart-container">
        <div id="chart-button-container">
          <button id="pie"
            className="chart-button selected"
            onClick={this.setChartType}
            data-type="pie"
            title="Pie chart">
              <i className="fas fa-chart-pie" data-type="pie"></i>
          </button>
          <button id="bar"
            className="chart-button"
            onClick={this.setChartType}
            data-type="bar"
            title="Bar chart">
              <i className="fas fa-chart-bar" data-type="bar"></i>
          </button>
          <button id="radar"
            className="chart-button"
            onClick={this.setChartType}
            data-type="radar"
            title="Radar chart">
              <i className="material-icons"
                data-type="radar">track_changes</i>
          </button>
          <button id="doughnut"
            className="chart-button"
            onClick={this.setChartType}
            data-type="doughnut"
            title="Doughnut chart">
              <i className="material-icons"
                data-type="doughnut">donut_small</i>
          </button>
        </div>
        <div id="chart-visual-container">
          {this.state.chartType === 'bar' ? (
            <Bar data={chartData} options={chartOptions} />
          ) : (
            this.state.chartType === 'radar' ? (
              <Radar data={chartData} options={chartOptions} />
            ) : (
              this.state.chartType === 'doughnut' ? (
                <Doughnut data={chartData} options={chartOptions} />
              ) : (
                <Pie data={chartData} options={chartOptions} />
              )
            )
          )}
        </div>
      </div>
    );
  }
}

export default Chart;

import React, { Component } from 'react';
import './StarterButtons.css';

// Set of buttons used to toggle activity starter sets
class StarterButtons extends Component {
  constructor(props) {
    super(props);

    /* Activity starter set types, including "Clear" to return to starting
    state */
    this.types = [
      'Student',
      'Professional',
      'Retired',
      'Clear'
    ];

    this.toggleActivities = this.toggleActivities.bind(this);
  }

  /* Set button's activity array as current activities in table and chart when
  button is clicked */
  toggleActivities(e) {
    // Get activity starter type from button
    const type = e.target.dataset.type;

    let activities;

    // Set activities array for different starter types
    if (type === 'student') {
      activities = [
        {id: 0, value: 0, label: ''},
        {id: 1, value: 8, label: 'sleep'},
        {id: 2, value: 0.25, label: 'breakfast'},
        {id: 3, value: 6, label: 'class'},
        {id: 4, value: 0.5, label: 'lunch'},
        {id: 5, value: 3, label: 'homework'},
        {id: 6, value: 0.5, label: 'dinner'},
        {id: 7, value: 4, label: 'studying'},
        {id: 8, value: 1.75, label: 'relax'}
      ];
    }

    else if (type === 'professional') {
      activities = [
        {id: 0, value: 0, label: ''},
        {id: 1, value: 8, label: 'sleep'},
        {id: 2, value: 0.5, label: 'breakfast'},
        {id: 3, value: 8, label: 'work'},
        {id: 4, value: 0.5, label: 'lunch'},
        {id: 5, value: 1, label: 'working out'},
        {id: 6, value: 0.5, label: 'dinner'},
        {id: 7, value: 5.5, label: 'relaxing'}
      ]
    }

    else if (type === 'retired') {
      activities = [
        {id: 0, value: 0, label: ''},
        {id: 1, value: 8, label: 'sleep'},
        {id: 2, value: 0.5, label: 'breakfast'},
        {id: 3, value: 2, label: 'exercise'},
        {id: 4, value: 0.5, label: 'lunch'},
        {id: 5, value: 2, label: 'gardening'},
        {id: 6, value: 4, label: 'volunteering'},
        {id: 7, value: 2, label: 'reading'},
        {id: 8, value: 1, label: 'dinner'},
        {id: 9, value: 1, label: 'watching tv'},
        {id: 10, value: 1, label: 'taking a walk'},
        {id: 11, value: 2, label: 'family time'},
      ];
    }

    else if (type === 'clear') {
      activities = [
        {id: 0, value: 24, label: '', color: '#DCDCDC'},
        {id: '?', value: '', label: ''}
      ];
    }

    return this.props.onButtonClick(activities);
  }

  render() {
    return (
      <div>
      {this.types.map(type =>
        <button
          key={type.toLowerCase()}
          id={type.toLowerCase()}
          data-type={type.toLowerCase()}
          onClick={this.toggleActivities}>{type}</button>
      )}
      </div>
    );
  }
}

export default StarterButtons;

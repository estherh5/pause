import React, { Component } from 'react';
import './ActivityInput.css';

// Input for entering activity label or hours
class ActivityInput extends Component {
  constructor(props) {
    super(props);

    this.getValue = this.getValue.bind(this);
  }

  // Get input value when user focuses out of input
  getValue(e) {
    // Ignore value if activity hasn't been added yet
    if (e.target.dataset.id === '?') {
      return;
    }

    let inputValue;

    // Get activity id from data-id value and convert to number
    const activityId = parseInt(e.target.dataset.id, 10);

    // Convert string value to number if input is for hours
    if (e.target.type === 'number') {
      inputValue = parseFloat(e.target.value, 10);
    }

    // Otherwise, trim whitespace from input for label
    else {
      inputValue = e.target.value.trim();
    }

    return this.props.onBlur(activityId, inputValue);
  }

  render() {
    return (
      <input
        id={this.props.type + this.props.id}
        className={this.props.className}
        data-id={this.props.id}
        type={this.props.type}
        placeholder={this.props.placeholder}
        min={this.props.min}
        max={this.props.max}
        step={this.props.step}
        defaultValue={this.props.value}
        onBlur={this.getValue} />
    );
  }
}

export default ActivityInput;

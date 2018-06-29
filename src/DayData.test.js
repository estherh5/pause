import React from 'react';
import ReactDOM from 'react-dom';
import DayData from './DayData';

it('renders without crashing', () => {
  const div = document.createElement('div');
  ReactDOM.render(<DayData />, div);
  ReactDOM.unmountComponentAtNode(div);
});

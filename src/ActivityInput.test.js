import React from 'react';
import ReactDOM from 'react-dom';
import ActivityInput from './ActivityInput';

it('renders without crashing', () => {
  const div = document.createElement('div');
  ReactDOM.render(<ActivityInput />, div);
  ReactDOM.unmountComponentAtNode(div);
});

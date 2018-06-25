import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import registerServiceWorker from './registerServiceWorker';

ReactDOM.render(<App />, document.getElementById('root'));
ReactDOM.render(
    <span>
      © 2018 <a href="https://crystalprism.io">Crystal Prism</a>
    </span>,
    document.getElementById('footer'));

registerServiceWorker();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

createRoot(document.getElementById('footer')).render(
  <span>
    © Copyright 2017-{new Date().getFullYear()}{' '}
    <a href="https://crystalprism.io" title="Crystal Prism">
      Crystal Prism
    </a>
  </span>,
);

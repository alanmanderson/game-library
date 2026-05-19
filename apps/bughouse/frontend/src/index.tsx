import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initLogService } from './logservice';

initLogService({ service: 'bughouse' });

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { trackPageView } from './plausible';

trackPageView();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

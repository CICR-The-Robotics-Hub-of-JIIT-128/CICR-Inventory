import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initDeviceNotifications } from './utils/deviceNotification';

// Suppress console telemetry in production to prevent console inspection
if (typeof window !== 'undefined' && import.meta.env.PROD) {
  const noop = () => {};
  window.console.log = noop;
  window.console.info = noop;
  window.console.debug = noop;
  window.console.warn = noop;
}

if (typeof window !== 'undefined') {
  // Proactive console warning against console scraping / tampering
  console.log(
    '%cSTOP! CICR Security Guard',
    'color: #ef4444; font-size: 24px; font-weight: 900;'
  );
  console.log(
    '%cThis browser console is protected. Do not paste code, passwords, or tokens here.',
    'font-size: 13px; color: #a1a1aa;'
  );
}

// Initialize native device push notifications & service worker
initDeviceNotifications();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

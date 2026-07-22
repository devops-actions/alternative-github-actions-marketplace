import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { OverviewPage } from './pages/OverviewPage';
import { DetailPage } from './pages/DetailPage';
import { StatusPage } from './pages/StatusPage';
import { StateOfActionsPage } from './pages/StateOfActionsPage';
import { AboutPage } from './pages/AboutPage';
import { trackPageView as trackPlausible } from './plausible';
import './App.css';

type TelemetryModule = typeof import('./telemetry');

let telemetryModulePromise: Promise<TelemetryModule> | null = null;

// Application Insights (~200KB gzipped) is only needed when telemetry is
// actually configured, and never in local/dev builds. Loading it via a
// dynamic import lets Vite split it into its own chunk so it doesn't add to
// the initial bundle for users who never trigger it.
function loadTelemetry(): Promise<TelemetryModule> | null {
  if (!import.meta.env.PROD || !import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING) {
    return null;
  }

  if (!telemetryModulePromise) {
    telemetryModulePromise = import('./telemetry').then((telemetry) => {
      telemetry.initTelemetry();
      return telemetry;
    });
  }

  return telemetryModulePromise;
}

const AnalyticsTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const name = document.title || location.pathname;
    const uri = window.location.href;

    loadTelemetry()?.then((telemetry) => telemetry.trackPageView(name, uri));
    trackPlausible();
  }, [location]);

  return null;
};

const App: React.FC = () => {
  return (
    <Router>
      <AnalyticsTracker />
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/action/:owner/:name" element={<DetailPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/state" element={<StateOfActionsPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </Router>
  );
};

export default App;

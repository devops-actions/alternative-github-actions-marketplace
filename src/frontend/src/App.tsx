import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { OverviewPage } from './pages/OverviewPage';
import { DetailPage } from './pages/DetailPage';
import { trackPageView } from './telemetry';
import './App.css';

const AnalyticsTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    trackPageView(document.title || location.pathname, window.location.href);
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
      </Routes>
    </Router>
  );
};

export default App;

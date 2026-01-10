import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { OverviewPage } from './pages/OverviewPage';
import { DetailPage } from './pages/DetailPage';
import './App.css';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/action/:owner/:name" element={<DetailPage />} />
      </Routes>
    </Router>
  );
};

export default App;

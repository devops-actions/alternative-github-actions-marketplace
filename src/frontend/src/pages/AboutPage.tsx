import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar } from '../components/NavBar';

export const AboutPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="app">
      <div className="header">
        <NavBar />
        <h1>Alternative GitHub Actions Marketplace</h1>
        <p>About this project</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            border: 'none',
            color: '#0366d6',
            cursor: 'pointer',
            fontSize: 14,
            padding: '4px 0'
          }}
        >
          ← Back to marketplace
        </button>
      </div>

      <div className="status-card">
        <h2 className="status-card-title">🤔 Why this exists</h2>
        <p className="status-explanation">
          The official GitHub Marketplace is great for discovering Actions, but it is missing
          some useful information and default filtering. This site is an alternative view on
          top of the same public data, adding details like action type (Node/JavaScript, Docker,
          Composite), release history, and dependents count, plus search and filtering that make
          it easier to find the Action you need.
        </p>
      </div>

      <div className="status-card">
        <h2 className="status-card-title">⚙️ How the data is gathered</h2>
        <p className="status-explanation">
          A scheduled pipeline crawls public GitHub repositories that publish an Action
          (identified by an <code>action.yml</code> / <code>action.yaml</code> file), reads their
          metadata, and uploads it to this site's backend. The pipeline runs on a recurring
          schedule and re-uploads the <strong>most recently updated repos first</strong>, so
          actively maintained Actions are refreshed more often than stable ones.
        </p>
        <p className="status-explanation" style={{ marginTop: 8 }}>
          Only publicly available repository metadata is collected — things like the owner,
          name, description, release/tag info, and action type. No private data or credentials
          are gathered. Security-sensitive signals (e.g. vulnerability or Dependabot status) are
          intentionally kept out of this public UI.
        </p>
        <p className="status-explanation" style={{ marginTop: 8 }}>
          Want to see how fresh the data currently is?{' '}
          <a href="/status">Check the data status page →</a>
        </p>
      </div>

      <div className="status-card">
        <h2 className="status-card-title">🏗️ Architecture</h2>
        <p className="status-explanation">
          The site is built to run at low cost on Azure:
        </p>
        <ul className="status-explanation" style={{ marginTop: 8, paddingLeft: 20 }}>
          <li><strong>Azure Static Web Apps</strong> (Free tier) hosts this frontend.</li>
          <li><strong>Azure Functions</strong> (Consumption plan) serves the backend API.</li>
          <li><strong>Azure Table Storage</strong> stores the Action metadata.</li>
        </ul>
      </div>

      <div className="status-card">
        <h2 className="status-card-title">📦 Source code</h2>
        <p className="status-explanation">
          This entire project — frontend, backend, and data pipeline — is open source.
        </p>
        <p className="status-explanation" style={{ marginTop: 8 }}>
          <a
            href="https://github.com/devops-actions/alternative-github-actions-marketplace"
            target="_blank"
            rel="noopener noreferrer"
          >
            View the repository on GitHub ↗
          </a>
        </p>
      </div>
    </div>
  );
};

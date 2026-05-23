import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DbStatus } from '../types/Action';
import { actionsService } from '../services/actionsService';

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'Unknown';

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}

function formatUtc(isoString: string | null): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '—';
  return date.toUTCString().replace(' GMT', ' UTC');
}

interface AgeBucket {
  label: string;
  count: number;
  color: string;
  description: string;
}

function buildBuckets(status: DbStatus): AgeBucket[] {
  const d = status.ageDistribution;
  return [
    {
      label: 'Within 1 day',
      count: d.within1day,
      color: '#2ea44f',
      description: 'Data changed in the last 24 hours'
    },
    {
      label: '1–7 days',
      count: d.within7days,
      color: '#0366d6',
      description: 'Data changed in the last week'
    },
    {
      label: '7–30 days',
      count: d.within30days,
      color: '#e36209',
      description: 'Data changed in the last month'
    },
    {
      label: 'Over 30 days',
      count: d.olderThan30days,
      color: '#d73a49',
      description: 'Data has not changed in over 30 days'
    },
    {
      label: 'No timestamp',
      count: d.noTimestamp,
      color: '#999',
      description: 'No sync timestamp recorded'
    }
  ].filter(b => b.count > 0);
}

export const StatusPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actionsService.fetchDbStatus()
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load status data.');
        setLoading(false);
        console.error(err);
      });
  }, []);

  return (
    <div className="app">
      <div className="header">
        <h1>Alternative GitHub Actions Marketplace</h1>
        <p>Database freshness status</p>
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

      {loading && (
        <div className="loading">Loading status…</div>
      )}

      {error && (
        <div className="error-message">{error}</div>
      )}

      {status && (
        <>
          {/* What this shows */}
          <div className="status-card">
            <h2 className="status-card-title">ℹ️ What this page shows</h2>
            <p className="status-explanation">
              Each action record in the database has a <strong>Last Synced</strong> timestamp.
              This is updated when the action's data <em>changes</em> — not on every pipeline run.
              If an action's data hasn't changed since the last upload, its timestamp stays the same.
            </p>
            <p className="status-explanation" style={{ marginTop: 8 }}>
              Our pipeline runs <strong>every 6 hours</strong> and uploads the{' '}
              <strong>most recently updated repos first</strong> each run. Repos whose data is stable
              will naturally have older timestamps here — that's expected, not a problem.
            </p>
            <p className="status-explanation" style={{ marginTop: 8 }}>
              <strong>Want the full operator view?</strong>{' '}
              <a
                href="https://github.com/rajbos/actions-marketplace-checks/actions/workflows/environment-state.yml"
                target="_blank"
                rel="noopener noreferrer"
              >
                View environment state workflow runs ↗
              </a>
            </p>
          </div>

          {/* Summary cards */}
          <div className="status-summary-row">
            <div className="status-summary-card">
              <div className="status-summary-label">Total actions tracked</div>
              <div className="status-summary-value">{status.totalCount.toLocaleString()}</div>
            </div>
            <div className="status-summary-card">
              <div className="status-summary-label">Most recent data change</div>
              <div className="status-summary-value">{formatRelativeTime(status.newestSyncedUtc)}</div>
              <div className="status-summary-sub">{formatUtc(status.newestSyncedUtc)}</div>
            </div>
            <div className="status-summary-card">
              <div className="status-summary-label">Oldest unchanged record</div>
              <div className="status-summary-value">{formatRelativeTime(status.oldestSyncedUtc)}</div>
              <div className="status-summary-sub">{formatUtc(status.oldestSyncedUtc)}</div>
            </div>
          </div>

          {/* Age distribution */}
          <div className="status-card">
            <h2 className="status-card-title">Age distribution — time since data last changed</h2>
            <p className="status-explanation" style={{ marginBottom: 16 }}>
              How long ago each action's data was last written to the database.
              Actions with stable data will appear in older buckets — this is normal.
            </p>
            {buildBuckets(status).map(bucket => {
              const pct = status.totalCount > 0
                ? Math.round((bucket.count / status.totalCount) * 100)
                : 0;
              return (
                <div key={bucket.label} className="age-bucket">
                  <div className="age-bucket-header">
                    <span className="age-bucket-label">{bucket.label}</span>
                    <span className="age-bucket-count">
                      {bucket.count.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                  <div className="age-bucket-bar-bg">
                    <div
                      className="age-bucket-bar-fill"
                      style={{ width: `${pct}%`, backgroundColor: bucket.color }}
                    />
                  </div>
                  <div className="age-bucket-desc">{bucket.description}</div>
                </div>
              );
            })}
          </div>

          <div className="status-generated">
            Status generated at {formatUtc(status.generatedAt)}
          </div>
        </>
      )}
    </div>
  );
};

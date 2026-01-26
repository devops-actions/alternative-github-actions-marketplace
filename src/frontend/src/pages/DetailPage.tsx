import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { Action } from '../types/Action';
import { actionsService } from '../services/actionsService';
import { splitOwnerRepo } from '../services/utils';

export const DetailPage: React.FC = () => {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const [action, setAction] = useState<Action | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readmeContent, setReadmeContent] = useState<string>('');
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeError, setReadmeError] = useState<string | null>(null);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  useEffect(() => {
    if (!owner || !name) {
      setError('Invalid action parameters');
      setLoading(false);
      return;
    }

    loadAction();
  }, [owner, name]);

  useEffect(() => {
    const loadReadme = async () => {
      if (!owner || !name) return;

      try {
        setReadmeLoading(true);
        setReadmeError(null);
        const version = selectedVersion || undefined;
        const content = await actionsService.fetchReadme(owner, name, version);
        
        if (content) {
          setReadmeContent(content);
        } else {
          setReadmeError('README not found');
          setReadmeContent('');
        }
      } catch (err) {
        setReadmeError('Failed to load README');
        setReadmeContent('');
        console.error(err);
      } finally {
        setReadmeLoading(false);
      }
    };

    if (owner && name && selectedVersion !== undefined) {
      loadReadme();
    }
  }, [selectedVersion, owner, name]);

  const loadAction = async () => {
    if (!owner || !name) return;

    try {
      setLoading(true);
      let actionData = actionsService.getAction(owner, name);

      if (!actionData) {
        const fetchedAction = await actionsService.fetchActionDetail(owner, name);
        actionData = fetchedAction || undefined;
      }

      if (!actionData) {
        setError('Action not found');
        setAction(null);
      } else {
        setAction(actionData);
        if (actionData.releaseInfo && actionData.releaseInfo.length > 0) {
          setSelectedVersion(actionData.releaseInfo[0]);
        }
        setError(null);
      }
    } catch (err) {
      setError('Failed to load action details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getActionTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'Node':
        return 'badge-node';
      case 'Docker':
        return 'badge-docker';
      case 'Composite':
        return 'badge-composite';
      default:
        return '';
    }
  };

  const getAgeClass = (isoDate?: string) => {
    if (!isoDate) return '';
    const then = new Date(isoDate);
    if (Number.isNaN(then.getTime())) return '';
    const now = new Date();
    const days = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));

    if (days > 365) return 'stale';
    if (days > 90) return 'aged';
    return '';
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading action details...</div>
      </div>
    );
  }

  if (error || !action) {
    return (
      <div className="app">
        <button className="back-button" onClick={handleBack}>
          ← Back to Overview
        </button>
        <div className="error-message">{error || 'Action not found'}</div>
      </div>
    );
  }

  const dependentsCount = parseInt(action.dependents.dependents);

  return (
    <div className="app">
      <div className="header">
        <h1>Alternative GitHub Actions Marketplace</h1>
        <p>Browse and search through GitHub Actions with more information</p>
      </div>

      <button className="back-button" onClick={handleBack}>
        ← Back to Overview
      </button>

      <div className="detail-page">
        <div className="detail-header">
          <h1 className="detail-title">{`${action.owner} / ${splitOwnerRepo(action).repo}`}</h1>
          <div className="detail-badges">
            <span
              className={`action-badge ${getActionTypeBadgeClass(
                action.actionType.actionType
              )}`}
            >
              {action.actionType.actionType === 'Node' && action.actionType.nodeVersion
                ? `Node ${action.actionType.nodeVersion}`
                : action.actionType.actionType}
            </span>
            {action.verified && (
              <span className="verified-badge">✓ Verified</span>
            )}
            {action.repoInfo.archived && (
              <span className="archived-badge">📦 Archived</span>
            )}
          </div>
        </div>

        <div className="info-grid">
          <div className={`info-card ${action.repoInfo.archived ? 'archived' : ''}`}>
            <h3>Used by</h3>
            <div className="value dependents-highlight">
              {dependentsCount.toLocaleString()}
            </div>
          </div>

          <div className={`info-card ${action.repoInfo.archived ? 'archived' : ''}`}>
            <h3>Latest Release</h3>
            <div className="value">
              {action.releaseInfo && action.releaseInfo.length > 0
                ? action.releaseInfo[0]
                : 'N/A'}
            </div>
          </div>

          <div className={`info-card ${action.repoInfo.archived ? 'archived' : ''}`}>
            <h3>OpenSSF Score</h3>
            <div className="value">
              {action.ossf ? action.ossfScore.toFixed(1) : 'N/A'}
            </div>
          </div>

          <div className={`info-card ${action.repoInfo.archived ? 'archived' : ''} ${getAgeClass(action.repoInfo.updated_at)}`}>
            <h3>Last Updated</h3>
            <div className={`value ${getAgeClass(action.repoInfo.updated_at)}`}>
              {action.repoInfo.updated_at ? new Date(action.repoInfo.updated_at).toLocaleDateString() : 'Unknown'}
            </div>
          </div>
        </div>

        <div className="info-grid">
          <div className={`info-card ${action.repoInfo.archived ? 'archived' : ''}`}>
            <h3>Action Type Details</h3>
            <div className="value" style={{ fontSize: '14px' }}>
              {action.actionType.nodeVersion ? (
                <div>{`Node: v${action.actionType.nodeVersion}`}</div>
              ) : action.actionType.actionDockerType ? (
                <div>{`Docker: ${action.actionType.actionDockerType}`}</div>
              ) : (
                <div>{action.actionType.actionType}</div>
              )}
            </div>
          </div>

          <div className={`info-card ${action.repoInfo.archived ? 'archived' : ''}`}>
            <h3>Repository Info</h3>
            <div className="value" style={{ fontSize: '14px' }}>
              {action.forkFound ? 'Fork' : 'Original'}
              <br />
              {action.repoSize
                ? `${(action.repoSize / 1024).toFixed(1)} MB`
                : 'Size N/A'}
              <br />
              <a
                href={`https://github.com/${action.owner}/${splitOwnerRepo(action).repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="repo-link"
              >
                View on GitHub →
              </a>
            </div>
          </div>
        </div>

        {action.releaseInfo && action.releaseInfo.length > 0 && (
          <div className="version-selector">
            <label htmlFor="version-select">View README for version:</label>
            <select
              id="version-select"
              value={selectedVersion}
              onChange={e => setSelectedVersion(e.target.value)}
            >
              {action.releaseInfo.map(version => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="readme-section">
          <h2>README</h2>
          {readmeLoading && (
            <div className="loading">Loading README...</div>
          )}
          {readmeError && !readmeLoading && (
            <div className="error-message">{readmeError}</div>
          )}
          {!readmeLoading && !readmeError && readmeContent && (
            <div 
              className="readme-content"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readmeContent) }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

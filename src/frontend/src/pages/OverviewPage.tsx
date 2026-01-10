import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Action, ActionTypeFilter } from '../types/Action';
import { actionsService } from '../services/actionsService';

export const OverviewPage: React.FC = () => {
  const [actions, setActions] = useState<Action[]>([]);
  const [filteredActions, setFilteredActions] = useState<Action[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActionTypeFilter>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = actionsService.subscribe(() => {
      setActions(actionsService.getActions());
    });

    loadActions();

    return () => {
      unsubscribe();
    };
  }, []);

  const loadActions = async () => {
    try {
      setLoading(true);
      const data = await actionsService.fetchActions();
      setActions(data);
      setError(null);
    } catch (err) {
      setError('Failed to load actions. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = actions;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        action =>
          action.name.toLowerCase().includes(query) ||
          action.owner.toLowerCase().includes(query)
      );
    }

    if (typeFilter !== 'All') {
      filtered = filtered.filter(
        action => action.actionType.actionType === typeFilter
      );
    }

    setFilteredActions(filtered);
  }, [actions, searchQuery, typeFilter]);

  const stats = actionsService.getStats();

  const handleActionClick = (action: Action) => {
    navigate(`/action/${encodeURIComponent(action.owner)}/${encodeURIComponent(action.name)}`);
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

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading actions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <h1>Alternative GitHub Actions Marketplace</h1>
        <p>Browse and search through {stats.total.toLocaleString()} GitHub Actions</p>
      </div>

      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-label">Total Actions</span>
          <span className="stat-value">{stats.total.toLocaleString()}</span>
        </div>
        {Object.entries(stats.byType).map(([type, count]) => (
          <div key={type} className="stat-item">
            <span className="stat-label">{type} Actions</span>
            <span className="stat-value">{count.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by action name or owner..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Type:</label>
          <button
            className={typeFilter === 'All' ? 'active' : ''}
            onClick={() => setTypeFilter('All')}
          >
            All
          </button>
          <button
            className={typeFilter === 'Node' ? 'active' : ''}
            onClick={() => setTypeFilter('Node')}
          >
            Node/JS
          </button>
          <button
            className={typeFilter === 'Docker' ? 'active' : ''}
            onClick={() => setTypeFilter('Docker')}
          >
            Docker
          </button>
          <button
            className={typeFilter === 'Composite' ? 'active' : ''}
            onClick={() => setTypeFilter('Composite')}
          >
            Composite
          </button>
        </div>
      </div>

      {filteredActions.length === 0 ? (
        <div className="no-results">
          <h2>No actions found</h2>
          <p>Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="actions-grid">
          {filteredActions.map(action => (
            <div
              key={`${action.owner}/${action.name}`}
              className="action-card"
              onClick={() => handleActionClick(action)}
            >
              <div className="action-header">
                <div className="action-title">
                  <div className="action-owner">{action.owner}</div>
                  <div className="action-name">{action.name}</div>
                </div>
                <span
                  className={`action-badge ${getActionTypeBadgeClass(
                    action.actionType.actionType
                  )}`}
                >
                  {action.actionType.actionType}
                </span>
              </div>

              <div className="action-meta">
                <div className="meta-item">
                  <span>👥</span>
                  <strong className="dependents-highlight">
                    {parseInt(action.dependents.dependents).toLocaleString()}
                  </strong>
                  <span>dependents</span>
                </div>
                {action.verified && (
                  <div className="meta-item">
                    <span>✓</span>
                    <span>Verified</span>
                  </div>
                )}
                {action.repoInfo.archived && (
                  <div className="meta-item">
                    <span>📦</span>
                    <span>Archived</span>
                  </div>
                )}
              </div>

              {action.releaseInfo && action.releaseInfo.length > 0 && (
                <div className="action-meta">
                  <div className="meta-item">
                    <span>🏷️</span>
                    <span>Latest: {action.releaseInfo[0]}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Action, ActionStats, ActionTypeFilter } from '../types/Action';
import { actionsService } from '../services/actionsService';

const PAGE_SIZE = 12;

export const OverviewPage: React.FC = () => {
  const [actions, setActions] = useState<Action[]>([]);
  const [filteredActions, setFilteredActions] = useState<Action[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActionTypeFilter>('All');
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'updated' | 'dependents'>('updated');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ActionStats>({ total: 0, byType: {}, verified: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = actionsService.subscribe(() => {
      setActions(actionsService.getActions());
    });

    loadData();

    return () => {
      unsubscribe();
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, actionsData] = await Promise.all([
        actionsService.fetchStats(),
        actionsService.fetchActions()
      ]);
      setStats(statsData);
      setActions(actionsData);
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
    if (showVerifiedOnly) {
      filtered = filtered.filter(action => action.verified === true);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'dependents') {
        const aDeps = parseInt(a.dependents.dependents) || 0;
        const bDeps = parseInt(b.dependents.dependents) || 0;
        return bDeps - aDeps; // Descending
      } else {
        // Sort by updated date
        const aDate = new Date(a.repoInfo.updated_at).getTime();
        const bDate = new Date(b.repoInfo.updated_at).getTime();
        return bDate - aDate; // Descending (most recent first)
      }
    });

    setFilteredActions(filtered);
    setCurrentPage(1);
  }, [actions, searchQuery, typeFilter, showVerifiedOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredActions.length / PAGE_SIZE));
  const pagedActions = filteredActions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const goToPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(nextPage);
  };

  const showingFrom = filteredActions.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PAGE_SIZE, filteredActions.length);

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
          <label>Sort by:</label>
          <button
            className={sortBy === 'updated' ? 'active' : ''}
            onClick={() => setSortBy('updated')}
          >
            Last Updated
          </button>
          <button
            className={sortBy === 'dependents' ? 'active' : ''}
            onClick={() => setSortBy('dependents')}
          >
            Used by
          </button>
        </div>

        <div className="filter-group">
          <label>Type:</label>
          <button
            className={typeFilter === 'All' ? 'active' : ''}
            onClick={() => {
              setTypeFilter('All');
              setShowVerifiedOnly(false);
            }}
          >
            All
          </button>
          <button
            className={typeFilter === 'Node' ? 'active' : ''}
            onClick={() => setTypeFilter(typeFilter === 'Node' ? 'All' : 'Node')}
          >
            Node/JS
          </button>
          <button
            className={typeFilter === 'Docker' ? 'active' : ''}
            onClick={() => setTypeFilter(typeFilter === 'Docker' ? 'All' : 'Docker')}
          >
            Docker
          </button>
          <button
            className={typeFilter === 'Composite' ? 'active' : ''}
            onClick={() => setTypeFilter(typeFilter === 'Composite' ? 'All' : 'Composite')}
          >
            Composite
          </button>
          <button
            className={showVerifiedOnly ? 'active' : ''}
            style={{ marginLeft: '20px' }}
            onClick={() => setShowVerifiedOnly(v => !v)}
          >
            Verified only
          </button>
        </div>
      </div>

      {filteredActions.length === 0 ? (
        <div className="no-results">
          <h2>No actions found</h2>
          <p>Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          <div className="actions-grid">
            {pagedActions.map(action => (
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
                    <span>Used by</span>
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
                    <div className="meta-item">
                      <span>🕐</span>
                      <span>Updated: {new Date(action.repoInfo.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pagination">
            <div className="pagination-summary">
              Showing {showingFrom}-{showingTo} of {filteredActions.length.toLocaleString()} actions
            </div>
            <div className="pagination-controls">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span className="pagination-page">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

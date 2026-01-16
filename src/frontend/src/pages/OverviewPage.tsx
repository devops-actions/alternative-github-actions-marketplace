import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Action, ActionStats, ActionTypeFilter } from '../types/Action';
import { actionsService } from '../services/actionsService';
import { normalizeRepoName, matchesSearchQuery, isActionVerified } from '../services/utils';

const PAGE_SIZE = 12;
const OVERVIEW_STATE_KEY = 'overviewState:v1';

type OverviewUiState = {
  searchQuery: string;
  typeFilter: ActionTypeFilter;
  showVerifiedOnly: boolean;
  verifiedFilter?: 'all' | 'verified' | 'unverified';
  archivedFilter?: 'hide' | 'show' | 'only';
  sortBy: 'updated' | 'dependents';
  currentPage: number;
  scrollY?: number;
  openssfFilter?: 'all' | 'above5' | 'above7';
};

function readOverviewState(): Partial<OverviewUiState> | null {
  try {
    const raw = sessionStorage.getItem(OVERVIEW_STATE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeOverviewState(state: OverviewUiState) {
  try {
    sessionStorage.setItem(OVERVIEW_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export const OverviewPage: React.FC = () => {
  const initialPersisted = readOverviewState();
  const initialActions = actionsService.getActions();
  const initialStats = actionsService.getStats();

  const [actions, setActions] = useState<Action[]>(initialActions);
  const [filteredActions, setFilteredActions] = useState<Action[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => (initialPersisted?.searchQuery ?? ''));
  const [typeFilter, setTypeFilter] = useState<ActionTypeFilter>(() => {
    const candidate = initialPersisted?.typeFilter;
    const supported: ActionTypeFilter[] = ['All', 'Node', 'Docker', 'Composite', 'Unknown', 'No file found'];
    return candidate && supported.includes(candidate) ? candidate : 'All';
  });
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(() => Boolean(initialPersisted?.showVerifiedOnly));
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>(() => {
    const persisted = (initialPersisted as any)?.verifiedFilter as 'all' | 'verified' | 'unverified' | undefined;
    return persisted || 'all';
  });
  const [archivedFilter, setArchivedFilter] = useState<'hide' | 'show' | 'only'>(() => {
    const candidate = initialPersisted?.openssfFilter as unknown as string | undefined;
    // if there's an explicit persisted archivedFilter use it, otherwise default to 'hide'
    const persisted = (initialPersisted as any)?.archivedFilter as 'hide' | 'show' | 'only' | undefined;
    return persisted || 'hide';
  });
  const [openssfFilter, setOpenssfFilter] = useState<'all' | 'above5' | 'above7'>(() => {
    const candidate = initialPersisted?.openssfFilter as string | undefined;
    return candidate === 'above5' || candidate === 'above7' ? candidate : 'all';
  });
  const [sortBy, setSortBy] = useState<'updated' | 'dependents'>(() => (initialPersisted?.sortBy === 'dependents' ? 'dependents' : 'updated'));
  const [currentPage, setCurrentPage] = useState(() => {
    const candidate = Number(initialPersisted?.currentPage);
    return Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
  });
  const [loading, setLoading] = useState(() => initialActions.length === 0 && initialStats.total === 0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ActionStats>(initialStats);
  const navigate = useNavigate();

  const prevFiltersRef = useRef({
    searchQuery,
    typeFilter,
    showVerifiedOnly,
    archivedFilter,
    verifiedFilter,
    sortBy,
    openssfFilter
  });
  const restoredScrollRef = useRef(false);

  const setTypeFilterFromStats = (type: string) => {
    if (type === 'All') {
      setTypeFilter('All');
      return;
    }

    if (type === 'Verified') {
      setVerifiedFilter('verified');
      return;
    }

    if (type === 'Archived') {
      setArchivedFilter('only');
      return;
    }

    const supportedTypes: ActionTypeFilter[] = ['Node', 'Docker', 'Composite', 'Unknown', 'No file found'];
    if (supportedTypes.includes(type as ActionTypeFilter)) {
      setTypeFilter(type as ActionTypeFilter);
      return;
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('All');
    setShowVerifiedOnly(false);
    setArchivedFilter('hide');
    setOpenssfFilter('all');
    setSortBy('updated');
    setCurrentPage(1);
    try {
      sessionStorage.removeItem(OVERVIEW_STATE_KEY);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const unsubscribe = actionsService.subscribe(() => {
      setActions(actionsService.getActions());
      setStats(actionsService.getStats());
    });

    loadData();

    return () => {
      unsubscribe();
    };
  }, []);

  const loadData = async (options?: { retries?: number }) => {
    // Cold starts + large payloads can take a while; retry a bit longer before showing an error.
    const retries = Math.max(0, options?.retries ?? 5);
    const hadNoData = actionsService.getActions().length === 0 && actionsService.getStats().total === 0;

    if (hadNoData) {
      setLoading(true);
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const force = attempt > 0;
        const [statsData, actionsData] = await Promise.all([
          actionsService.fetchStats(force),
          actionsService.fetchActions(force)
        ]);
        setStats(statsData);
        setActions(actionsData);
        setError(null);
        setLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt >= retries) {
          break;
        }
        const delayMs = Math.min(2500 * (attempt + 1), 15000);
        console.warn(`Overview load failed (attempt ${attempt + 1}/${retries + 1}); retrying in ${delayMs}ms`, err);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    setError('Failed to load actions. Please try again later.');
    console.error(lastErr);
    setLoading(false);
  };

  useEffect(() => {
    writeOverviewState({
      searchQuery,
      typeFilter,
      showVerifiedOnly,
      verifiedFilter,
      archivedFilter,
      sortBy,
      openssfFilter,
      currentPage
    });
  }, [searchQuery, typeFilter, showVerifiedOnly, verifiedFilter, archivedFilter, sortBy, openssfFilter, currentPage]);

  useEffect(() => {
    let filtered = actions;

    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery) {
      filtered = filtered.filter(action => matchesSearchQuery({ owner: action.owner, name: action.name }, normalizedQuery));
    }

    if (typeFilter !== 'All') {
      filtered = filtered.filter(
        action => action?.actionType?.actionType === typeFilter
      );
    }
    if (verifiedFilter === 'verified') {
      filtered = filtered.filter(action => isActionVerified(action));
    } else if (verifiedFilter === 'unverified') {
      filtered = filtered.filter(action => !isActionVerified(action));
    }

    if (archivedFilter === 'only') {
      filtered = filtered.filter(action => action?.repoInfo?.archived === true);
    } else if (archivedFilter === 'hide') {
      filtered = filtered.filter(action => action?.repoInfo?.archived !== true);
    }

    // Filter by OpenSSF score threshold
    if (openssfFilter && openssfFilter !== 'all') {
      const threshold = openssfFilter === 'above7' ? 7 : 5;
      filtered = filtered.filter(action => {
        const score = typeof action.ossfScore === 'number' ? action.ossfScore : -1;
        return score > threshold;
      });
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'dependents') {
        const aDeps = parseInt(a?.dependents?.dependents || '') || 0;
        const bDeps = parseInt(b?.dependents?.dependents || '') || 0;
        return bDeps - aDeps; // Descending
      } else {
        // Sort by updated date
        const aDate = new Date(a?.repoInfo?.updated_at || 0).getTime();
        const bDate = new Date(b?.repoInfo?.updated_at || 0).getTime();
        return bDate - aDate; // Descending (most recent first)
      }
    });

    setFilteredActions(filtered);

    const prev = prevFiltersRef.current;
    const filtersChanged =
      prev.searchQuery !== searchQuery ||
      prev.typeFilter !== typeFilter ||
      prev.showVerifiedOnly !== showVerifiedOnly ||
      prev.verifiedFilter !== verifiedFilter ||
      prev.archivedFilter !== archivedFilter ||
      prev.sortBy !== sortBy ||
      prev.openssfFilter !== openssfFilter;

      prevFiltersRef.current = { searchQuery, typeFilter, showVerifiedOnly, archivedFilter, verifiedFilter, sortBy, openssfFilter };

    const nextTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (filtersChanged) {
      setCurrentPage(1);
    } else {
      setCurrentPage(p => Math.min(Math.max(p, 1), nextTotalPages));
    }
  }, [actions, searchQuery, typeFilter, showVerifiedOnly, archivedFilter, sortBy, openssfFilter]);

  useEffect(() => {
    if (restoredScrollRef.current) {
      return;
    }

    if (loading) {
      return;
    }

    const persisted = readOverviewState();
    const scrollY = Number(persisted?.scrollY);
    if (!Number.isFinite(scrollY) || scrollY <= 0) {
      restoredScrollRef.current = true;
      return;
    }

    restoredScrollRef.current = true;
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  }, [loading]);

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
    writeOverviewState({
      searchQuery,
      typeFilter,
      showVerifiedOnly,
      archivedFilter,
      sortBy,
      currentPage,
      scrollY: window.scrollY
    });
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
    const empty = actions.length === 0 && stats.total === 0;
    return (
      <div className="app">
        <div className="error-message">{error}</div>
        {empty && (
          <button type="button" onClick={() => loadData()} style={{ marginTop: 12 }}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <h1>Alternative GitHub Actions Marketplace</h1>
        <p>Browse and search through {stats.total.toLocaleString()} GitHub Actions with more information</p>
      </div>

      <div className="stats-bar">
        <button
          type="button"
          className="stat-item stat-button"
          onClick={() => setTypeFilterFromStats('All')}
          aria-label="Show all actions"
        >
          <span className="stat-label">Total Actions</span>
          <span className="stat-value">{stats.total.toLocaleString()}</span>
        </button>

        <button
          type="button"
          className="stat-item stat-button"
          onClick={() => setTypeFilterFromStats('Verified')}
          aria-label="Show verified actions"
        >
          <span className="stat-label">Verified Actions</span>
          <span className="stat-value">{stats.verified.toLocaleString()}</span>
        </button>

        {Object.entries(stats.byType).map(([type, count]) => (
          <button
            key={type}
            type="button"
            className="stat-item stat-button"
            onClick={() => setTypeFilterFromStats(type)}
            aria-label={`Filter by ${type} actions`}
          >
            <span className="stat-label">{type} Actions</span>
            <span className="stat-value">{count.toLocaleString()}</span>
          </button>
        ))}
        
        <button
          type="button"
          className="stat-item stat-button"
          onClick={() => setTypeFilterFromStats('Archived')}
          aria-label="Include archived actions"
        >
          <span className="stat-label">Archived Actions</span>
          <span className="stat-value">{stats.archived.toLocaleString()}</span>
        </button>
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
            onClick={() => {
              setTypeFilter('All');
            }}
          >
            All
          </button>
          <button
            className={typeFilter === 'Node' ? 'active' : ''}
            onClick={() => {
              setTypeFilter(typeFilter === 'Node' ? 'All' : 'Node');
            }}
          >
            Node/JS
          </button>
          <button
            className={typeFilter === 'Docker' ? 'active' : ''}
            onClick={() => {
              setTypeFilter(typeFilter === 'Docker' ? 'All' : 'Docker');
            }}
          >
            Docker
          </button>
          <button
            className={typeFilter === 'Composite' ? 'active' : ''}
            onClick={() => {
              setTypeFilter(typeFilter === 'Composite' ? 'All' : 'Composite');
            }}
          >
            Composite
          </button>
          <button
            className={typeFilter === 'Unknown' ? 'active' : ''}
            onClick={() => {
              setTypeFilter(typeFilter === 'Unknown' ? 'All' : 'Unknown');
            }}
          >
            Unknown
          </button>
          <button
            className={typeFilter === 'No file found' ? 'active' : ''}
            onClick={() => {
              setTypeFilter(typeFilter === 'No file found' ? 'All' : 'No file found');
            }}
          >
            No file found
          </button>
        </div>

        <div className="controls-row">
          <div className="filter-group">
            <label>Verified:</label>
            <select data-testid="filter-verified" value={verifiedFilter} onChange={e => setVerifiedFilter(e.target.value as any)}>
              <option value="all">All</option>
              <option value="verified">Verified only</option>
              <option value="unverified">Only unverified</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Archived:</label>
            <select data-testid="filter-archived" value={archivedFilter} onChange={e => setArchivedFilter(e.target.value as any)}>
              <option value="hide">Hide archived</option>
              <option value="show">Show archived</option>
              <option value="only">Only archived</option>
            </select>
          </div>

          <div className="filter-group">
            <label>OpenSSF score:</label>
            <select data-testid="filter-ossf" value={openssfFilter} onChange={e => setOpenssfFilter(e.target.value as any)}>
              <option value="all">All scores</option>
              <option value="above5">Above 5</option>
              <option value="above7">Above 7</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Sort by:</label>
            <button data-testid="sort-updated"
              className={sortBy === 'updated' ? 'active' : ''}
              onClick={() => setSortBy('updated')}
            >
              Last Updated
            </button>
            <button data-testid="sort-dependents"
              className={sortBy === 'dependents' ? 'active' : ''}
              onClick={() => setSortBy('dependents')}
            >
              Used by
            </button>
          </div>
        </div>
      </div>

      {filteredActions.length === 0 ? (
        <div className="no-results">
          <h2>No actions found</h2>
          <p>
            Try adjusting your search or filters. ({actions.length.toLocaleString()} loaded,{' '}
            {filteredActions.length.toLocaleString()} matching)
          </p>
          <button
            type="button"
            className="back-button"
            onClick={clearFilters}
            style={{ marginTop: '12px' }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="actions-grid">
            {pagedActions.map(action => (
              <div
                key={`${action.owner}/${action.name}`}
                className={`action-card ${action.repoInfo.archived ? 'archived' : ''}`}
                onClick={() => handleActionClick(action)}
              >
                <div className="action-header">
                  <div className="action-title">
                      <div className="action-owner">{action.owner}</div>
                      <div className="action-name">{normalizeRepoName(action.owner, action.name)}</div>
                  </div>
                  <span
                    className={`action-badge ${getActionTypeBadgeClass(
                      action?.actionType?.actionType
                    )}`}
                  >
                    {action?.actionType?.actionType || 'Unknown'}
                  </span>
                </div>

                <div className="action-meta">
                  <div className="meta-item">
                    <span>👥</span>
                    <strong className="dependents-highlight">
                      {(parseInt(action?.dependents?.dependents || '') || 0).toLocaleString()}
                    </strong>
                    <span>Used by</span>
                  </div>
                  {action.verified && (
                    <div className="meta-item">
                      <span>✓</span>
                      <span>Verified</span>
                    </div>
                  )}
                  {/* Show OpenSSF score if present */}
                  {typeof action.ossfScore === 'number' && (
                    <div className="meta-item">
                      <span>🔒</span>
                      <span>OpenSSF: <strong>{action.ossfScore.toFixed(1)}</strong></span>
                    </div>
                  )}
                  {action.repoInfo.archived && (
                    <div className="meta-item">
                      <span>📦</span>
                      <span>Archived</span>
                    </div>
                  )}
                </div>

                <div className="action-meta">
                  {action.releaseInfo && action.releaseInfo.length > 0 && (
                    <div className="meta-item">
                      <span>🏷️</span>
                      <span>Latest: {action.releaseInfo[0]}</span>
                    </div>
                  )}
                  <div className="meta-item">
                    <span>🕐</span>
                    <span>
                      Updated:{' '}
                      {action?.repoInfo?.updated_at
                        ? new Date(action.repoInfo.updated_at).toLocaleDateString()
                        : 'Unknown'}
                    </span>
                  </div>
                </div>
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

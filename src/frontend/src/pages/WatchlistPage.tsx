import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AuthenticatedUser,
  buildGitHubLoginUrl,
  buildLogoutUrl,
  fetchAuthenticatedUser
} from '../services/authService';

function normalizeActionRef(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const withoutHost = trimmed
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\/+$/, '');

  const segments = withoutHost.split('/').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1];
  if (!owner || !repo) {
    return null;
  }

  return `${owner}/${repo}`;
}

function getStorageKey(user: AuthenticatedUser): string {
  const safeProvider = encodeURIComponent((user.identityProvider || 'unknown').trim().toLowerCase());
  const safeUserId = encodeURIComponent(user.userId.trim());
  return `watchlist-actions:v1:${safeProvider}:${safeUserId}`;
}

export const WatchlistPage: React.FC = () => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [actions, setActions] = useState<string[]>([]);
  const [newAction, setNewAction] = useState('');
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAuthenticatedUser().then(authUser => {
      if (!active) {
        return;
      }

      setUser(authUser);
      setLoadingUser(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setActions([]);
      return;
    }

    const key = getStorageKey(user);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setActions([]);
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setActions([]);
        return;
      }

      setActions(parsed.filter((item): item is string => typeof item === 'string'));
    } catch {
      console.warn('Failed to parse stored watchlist data. Resetting local watchlist cache.');
      setActions([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const key = getStorageKey(user);
    localStorage.setItem(key, JSON.stringify(actions));
  }, [actions, user]);

  const sortedActions = useMemo(() => [...actions].sort((a, b) => a.localeCompare(b)), [actions]);

  const addAction = () => {
    const normalized = normalizeActionRef(newAction);
    if (!normalized) {
      setError('Enter a valid GitHub action as owner/repo or github.com/owner/repo.');
      return;
    }

    if (actions.includes(normalized)) {
      setError('That action is already in your watchlist.');
      return;
    }

    setActions(prev => [...prev, normalized]);
    setNewAction('');
    setError(null);
  };

  const removeAction = (value: string) => {
    setActions(prev => prev.filter(item => item !== value));
    if (editTarget === value) {
      setEditTarget(null);
      setEditValue('');
    }
  };

  const startEdit = (value: string) => {
    setEditTarget(value);
    setEditValue(value);
    setError(null);
  };

  const saveEdit = () => {
    if (!editTarget) {
      return;
    }

    const normalized = normalizeActionRef(editValue);
    if (!normalized) {
      setError('Enter a valid GitHub action as owner/repo or github.com/owner/repo.');
      return;
    }

    if (normalized !== editTarget && actions.includes(normalized)) {
      setError('That action is already in your watchlist.');
      return;
    }

    setActions(prev => prev.map(item => (item === editTarget ? normalized : item)));
    setEditTarget(null);
    setEditValue('');
    setError(null);
  };

  if (loadingUser) {
    return (
      <div className="app">
        <div className="loading">Checking GitHub login...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app">
        <div className="header">
          <h1>Action update watchlist</h1>
          <p>This route requires GitHub OAuth login.</p>
        </div>
        <div className="auth-gate-card">
          <p>Sign in with GitHub to manage your personal action watchlist.</p>
          <a className="primary-link-button" href={buildGitHubLoginUrl('/watchlist')}>
            Login with GitHub
          </a>
          <div style={{ marginTop: 12 }}>
            <Link to="/" className="header-link">Back to overview</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <h1>Action update watchlist</h1>
        <p>Track the actions you rely on and keep this list ready for update notifications.</p>
        <div className="header-actions">
          <span className="header-user">Signed in as {user.userDetails}</span>
          <a className="header-link" href={buildLogoutUrl('/')}>Logout</a>
          <Link className="header-link" to="/">Overview</Link>
        </div>
      </div>

      <div className="watchlist-card">
        <h2>Manual CRUD</h2>
        <p>Add, edit, and remove action repositories in owner/repo format.</p>

        <div className="watchlist-form">
          <input
            type="text"
            placeholder="actions/checkout"
            value={newAction}
            onChange={event => setNewAction(event.target.value)}
          />
          <button type="button" onClick={addAction}>Add</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {sortedActions.length === 0 ? (
          <div className="no-results" style={{ padding: '20px 0 0' }}>
            <p>No actions in your watchlist yet.</p>
          </div>
        ) : (
          <ul className="watchlist-list">
            {sortedActions.map(item => (
              <li key={item} className="watchlist-item">
                {editTarget === item ? (
                  <div className="watchlist-edit-row">
                    <input
                      type="text"
                      value={editValue}
                      onChange={event => setEditValue(event.target.value)}
                    />
                    <button type="button" onClick={saveEdit}>Save</button>
                    <button type="button" onClick={() => setEditTarget(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <span>{item}</span>
                    <div className="watchlist-actions">
                      <button type="button" onClick={() => startEdit(item)}>Edit</button>
                      <button type="button" onClick={() => removeAction(item)}>Remove</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

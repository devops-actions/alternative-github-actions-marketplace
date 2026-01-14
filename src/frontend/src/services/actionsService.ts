import { Action, ActionStats } from '../types/Action';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      result.push(item);
      continue;
    }

    if (item && typeof item === 'object') {
      const tagName = (item as { tag_name?: unknown }).tag_name;
      if (typeof tagName === 'string' && tagName.trim()) {
        result.push(tagName);
        continue;
      }
    }
  }

  return result;
}

function normalizeAction(raw: unknown): Action {
  const action = (raw && typeof raw === 'object') ? (raw as any) : {};

  // The production dataset can contain GitHub release objects; UI expects strings.
  const releaseInfo = normalizeStringArray(action.releaseInfo);
  const tagInfo = normalizeStringArray(action.tagInfo);

  // Be defensive with a couple of frequently read fields.
  const dependents = action.dependents && typeof action.dependents === 'object'
    ? action.dependents
    : { dependents: '0', dependentsLastUpdated: '' };

  if (dependents && typeof dependents.dependents === 'number') {
    dependents.dependents = String(dependents.dependents);
  }

  return {
    ...action,
    releaseInfo,
    tagInfo,
    dependents
  } as Action;
}

function extractArrayFromUnknown(value: unknown): unknown[] {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return extractArrayFromUnknown(parsed);
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const obj = value as Record<string, unknown>;

  // Common wrapper shapes.
  const preferredKeys = ['items', 'value', 'actions', 'results', 'data', 'body'];
  for (const key of preferredKeys) {
    const candidate = obj[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (key === 'body' && typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // ignore
      }
    }
  }

  // Last resort: find the first array-valued property.
  for (const candidate of Object.values(obj)) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

class ActionsService {
  private actions: Action[] = [];
  private loading: boolean = false;
  private lastFetch: number = 0;
  private listeners: Array<() => void> = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private stats: ActionStats = { total: 0, byType: {}, verified: 0, archived: 0 };
  private lastStatsFetch: number = 0;
  private inFlightActionsFetch: Promise<Action[]> | null = null;
  private inFlightStatsFetch: Promise<ActionStats> | null = null;

  constructor() {
    this.startAutoRefresh();
  }

  private startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.refreshTimer = setInterval(() => {
      this.fetchActions(true);
    }, REFRESH_INTERVAL);
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  async fetchActions(force: boolean = false): Promise<Action[]> {
    const now = Date.now();
    
    if (!force && this.actions.length > 0 && (now - this.lastFetch) < REFRESH_INTERVAL) {
      return this.actions;
    }

    if (this.inFlightActionsFetch) {
      return await this.inFlightActionsFetch;
    }

    this.loading = true;

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/actions/list`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to fetch actions: ${response.statusText}`);
        }

        const data = await response.json();

        const items = extractArrayFromUnknown(data);
        const hasCountHeader = response.headers.has('x-actions-count');
        const declaredCount = Number(response.headers.get('x-actions-count') || '0');

        const serverExplicitlyEmpty =
          (hasCountHeader && declaredCount === 0) ||
          (Array.isArray(data) && data.length === 0);

        // If the server claims there are results but we couldn't extract them,
        // keep any previously cached actions instead of wiping the UI.
        if (items.length === 0 && this.actions.length > 0 && !serverExplicitlyEmpty) {
          const responseType = Array.isArray(data) ? 'array' : typeof data;
          const keys = (data && typeof data === 'object' && !Array.isArray(data))
            ? Object.keys(data)
            : [];
          console.warn(
            `Actions list response parsed to 0 items; keeping cached actions. responseType=${responseType}, keys=${keys.join(',')}`
          );
        } else {
          this.actions = items.map(normalizeAction);
        }

        this.lastFetch = now;
        this.notify();
        return this.actions;
      } catch (error) {
        console.error('Error fetching actions:', error);
        throw error;
      } finally {
        this.loading = false;
        this.inFlightActionsFetch = null;
      }
    })();

    this.inFlightActionsFetch = fetchPromise;
    return await fetchPromise;
  }

  async fetchStats(force: boolean = false): Promise<ActionStats> {
    const now = Date.now();
    if (!force && this.stats.total > 0 && (now - this.lastStatsFetch) < REFRESH_INTERVAL) {
      return this.stats;
    }

    if (this.inFlightStatsFetch) {
      return await this.inFlightStatsFetch;
    }

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/actions/stats`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to fetch stats: ${response.statusText}`);
        }

        const data = await response.json();
        const stats: ActionStats = {
          total: Number(data?.total) || 0,
          byType: data?.byType || {},
          verified: Number(data?.verified) || 0,
          archived: Number(data?.archived) || 0
        };
        this.stats = stats;
        this.lastStatsFetch = now;
        this.notify();
        return stats;
      } catch (error) {
        console.error('Error fetching stats:', error);
        throw error;
      } finally {
        this.inFlightStatsFetch = null;
      }
    })();

    this.inFlightStatsFetch = fetchPromise;
    return await fetchPromise;
  }

  getActions(): Action[] {
    return this.actions;
  }

  getAction(owner: string, name: string): Action | undefined {
    return this.actions.find(
      action => action.owner.toLowerCase() === owner.toLowerCase() && 
                action.name.toLowerCase() === name.toLowerCase()
    );
  }

  async fetchActionDetail(owner: string, name: string): Promise<Action | null> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/actions/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch action detail: ${response.statusText}`);
      }

      const data = await response.json();
      return normalizeAction(data);
    } catch (error) {
      console.error('Error fetching action detail:', error);
      throw error;
    }
  }

  isLoading(): boolean {
    return this.loading;
  }

  getStats() {
    return this.stats;
  }

  async fetchReadme(owner: string, name: string, version?: string): Promise<string | null> {
    try {
      const versionParam = version ? `?version=${encodeURIComponent(version)}` : '';
      const response = await fetch(
        `${API_BASE_URL}/actions/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme${versionParam}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch README: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Error fetching README:', error);
      throw error;
    }
  }

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.listeners = [];
  }
}

export const actionsService = new ActionsService();

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

class ActionsService {
  private actions: Action[] = [];
  private loading: boolean = false;
  private lastFetch: number = 0;
  private listeners: Array<() => void> = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private stats: ActionStats = { total: 0, byType: {}, verified: 0 };

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

    if (this.loading) {
      return this.actions;
    }

    this.loading = true;

    try {
      const response = await fetch(`${API_BASE_URL}/actions/list`);
      if (!response.ok) {
        throw new Error(`Failed to fetch actions: ${response.statusText}`);
      }
      
      const data = await response.json();

      // Prefer array responses, but tolerate a minimal wrapper shape
      // in case a proxy/middleware introduces `{ items: [...] }` / `{ value: [...] }`.
      const items = Array.isArray(data)
        ? data
        : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.value) ? data.value : []));

      this.actions = items.map(normalizeAction);
      this.lastFetch = now;
      this.notify();
      
      return this.actions;
    } catch (error) {
      console.error('Error fetching actions:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  async fetchStats(): Promise<ActionStats> {
    try {
      const response = await fetch(`${API_BASE_URL}/actions/stats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }

      const data = await response.json();
      const stats: ActionStats = {
        total: Number(data?.total) || 0,
        byType: data?.byType || {},
        verified: Number(data?.verified) || 0
      };
      this.stats = stats;
      this.notify();
      return stats;
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
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
      const response = await fetch(`${API_BASE_URL}/actions/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
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

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.listeners = [];
  }
}

export const actionsService = new ActionsService();

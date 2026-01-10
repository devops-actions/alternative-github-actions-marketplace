import { Action } from '../types/Action';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class ActionsService {
  private actions: Action[] = [];
  private loading: boolean = false;
  private lastFetch: number = 0;
  private listeners: Array<() => void> = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

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
      this.actions = Array.isArray(data) ? data : [];
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
      return await response.json();
    } catch (error) {
      console.error('Error fetching action detail:', error);
      throw error;
    }
  }

  isLoading(): boolean {
    return this.loading;
  }

  getStats() {
    const typeStats = this.actions.reduce((acc, action) => {
      const type = action.actionType.actionType;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: this.actions.length,
      byType: typeStats
    };
  }

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.listeners = [];
  }
}

export const actionsService = new ActionsService();

import * as vscode from 'vscode';

import { MIN_INTERVAL_HOURS } from './data/refreshPolicy';

export const CONFIG_SECTION = 'actionsMarketplace';

export interface ExtensionConfig {
  apiBaseUrl: string;
  autoRefresh: boolean;
  refreshIntervalHours: number;
  requestTimeoutMs: number;
  showStatusBarItem: boolean;
}

export function readConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    apiBaseUrl: config.get<string>('apiBaseUrl', '').trim(),
    autoRefresh: config.get<boolean>('autoRefresh', true),
    // Clamped rather than trusted: settings.json can hold any number, and a
    // sub-daily interval would just burn bandwidth on a dataset that only
    // changes once a day.
    refreshIntervalHours: Math.max(MIN_INTERVAL_HOURS, config.get<number>('refreshIntervalHours', 24)),
    requestTimeoutMs: Math.max(5_000, config.get<number>('requestTimeoutMs', 120_000)),
    showStatusBarItem: config.get<boolean>('showStatusBarItem', true)
  };
}

import * as vscode from 'vscode';

import { readConfig } from '../config';
import type { DatasetStore } from '../datasetStore';

/**
 * Status bar entry showing how fresh the dataset is.
 *
 * Freshness is the one thing a user cannot infer from the tools' answers, so it
 * gets a permanent, quiet home rather than a notification.
 */
export class DatasetStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: DatasetStore) {
    this.item = vscode.window.createStatusBarItem('actionsMarketplace.status', vscode.StatusBarAlignment.Right, 45);
    this.item.name = 'Actions Marketplace';
    this.item.command = 'actionsMarketplace.open';

    this.disposables.push(
      this.item,
      this.store.onDidChange(() => this.render()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('actionsMarketplace.showStatusBarItem')) {
          this.render();
        }
      })
    );

    this.render();
  }

  private render(): void {
    if (!readConfig().showStatusBarItem) {
      this.item.hide();
      return;
    }

    const status = this.store.getStatus();

    if (status.refreshing) {
      this.item.text = '$(sync~spin) Actions data';
      this.item.tooltip = 'Downloading the GitHub Actions marketplace dataset';
      this.item.backgroundColor = undefined;
    } else if (!status.ready) {
      this.item.text = '$(cloud-download) Actions data';
      this.item.tooltip = new vscode.MarkdownString(
        (status.lastError
          ? `Dataset unavailable: ${status.lastError}\n\n`
          : 'No marketplace dataset cached yet.\n\n')
        + 'Run **Actions Marketplace: Refresh Dataset Now** to download it.'
      );
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.text = `$(versions) ${status.count.toLocaleString('en-US')} actions`;
      this.item.tooltip = new vscode.MarkdownString([
        '**Alternative GitHub Actions Marketplace**',
        '',
        `- Actions: ${status.count.toLocaleString('en-US')}`,
        `- Data generated: ${status.generatedAt ?? 'unknown'} (${status.age})`,
        `- Last synced: ${status.lastSyncedAt ?? 'never'}`,
        status.lastError ? `- Last refresh error: ${status.lastError}` : '',
        '',
        'Click to open the marketplace explorer.'
      ].filter(Boolean).join('\n'));
      this.item.backgroundColor = status.lastError
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
    }

    this.item.show();
  }

  dispose(): void {
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

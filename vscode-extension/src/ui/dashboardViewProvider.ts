import * as vscode from 'vscode';

import type { DatasetStore } from '../datasetStore';
import { getDashboardHtml } from './dashboardHtml';
import { MarketplacePanel } from './marketplacePanel';
import { STATE_OF_ACTIONS_URL } from '../config';

type InboundMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'openExplorer' }
  | { type: 'quickSearch' }
  | { type: 'openWebsite' };

/**
 * The activity bar entry point: a compact dashboard mirroring the public
 * "State of Actions" page, plus quick links into the rest of the extension.
 *
 * Kept separate from `MarketplacePanel` because a view contributed to the
 * activity bar is resolved once per window and stays alive in the background,
 * whereas the explorer panel is opened on demand.
 */
export class DashboardViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'actionsMarketplace.dashboard';

  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: DatasetStore) {
    this.disposables.push(
      this.store.onDidChange(() => {
        void this.postState();
      })
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: []
    };
    webviewView.webview.html = getDashboardHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: InboundMessage) => {
      void this.handleMessage(message);
    }, null, this.disposables);

    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = undefined;
      }
    }, null, this.disposables);
  }

  private async handleMessage(message: InboundMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.postState();
        break;

      case 'refresh': {
        const outcome = await this.store.sync({ force: true });
        if (outcome.result === 'failed') {
          void vscode.window.showErrorMessage(`Actions Marketplace: refresh failed. ${outcome.error}`);
        }
        break;
      }

      case 'openExplorer':
        MarketplacePanel.show(this.store);
        break;

      case 'quickSearch':
        await vscode.commands.executeCommand('actionsMarketplace.quickSearch');
        break;

      case 'openWebsite':
        await vscode.env.openExternal(vscode.Uri.parse(STATE_OF_ACTIONS_URL));
        break;
    }
  }

  private async postState(): Promise<void> {
    if (!this.view) {
      return;
    }

    const status = this.store.getStatus();
    const index = this.store.getIndex();

    await this.view.webview.postMessage({
      type: 'state',
      status,
      stats: index ? index.stats() : null
    });
  }

  dispose(): void {
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

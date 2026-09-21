import * as vscode from 'vscode';

import type { DatasetStore } from '../datasetStore';
import type { ActionSearchResult, SearchFilters } from '../data/actionIndex';
import { formatPinnedRef } from '../data/actionRef';
import { getPanelHtml } from './panelHtml';

const VIEW_TYPE = 'actionsMarketplace.explorer';
const RESULT_LIMIT = 50;

interface SearchMessage {
  type: 'search';
  query: string;
  filters: {
    actionType?: string;
    owner?: string;
    verifiedOnly?: boolean;
    includeArchived?: boolean;
  };
}

interface CopyMessage {
  type: 'copy';
  value: string;
}

interface OpenMessage {
  type: 'open';
  url: string;
}

type InboundMessage =
  | SearchMessage
  | CopyMessage
  | OpenMessage
  | { type: 'ready' }
  | { type: 'refresh' };

interface SearchRow {
  ref: string;
  owner: string;
  name: string;
  latestVersion: string | null;
  latestSha: string | null;
  shortSha: string | null;
  publishedAt: string | null;
  actionType: string | null;
  dependents: number | null;
  ossfScore: number | null;
  verified: boolean;
  archived: boolean;
  /** Ready-to-paste `uses:` value, SHA-pinned when possible. */
  pinnedRef: string;
  url: string;
}

/**
 * The stats + search panel.
 *
 * Search runs in the extension host against the already-built index; the webview
 * only ever holds the page of results it is showing. Shipping all 35k entries
 * into the webview would cost megabytes per open for no benefit.
 */
export class MarketplacePanel {
  private static current: MarketplacePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private lastSearch: SearchMessage | null = null;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly store: DatasetStore
  ) {
    this.panel.webview.html = getPanelHtml(this.panel.webview);

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((message: InboundMessage) => {
        void this.handleMessage(message);
      }),
      this.store.onDidChange(() => {
        void this.postState();
        // Keep whatever the user was looking at in sync with the new dataset.
        if (this.lastSearch) {
          void this.handleMessage(this.lastSearch);
        }
      })
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static show(store: DatasetStore): MarketplacePanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (MarketplacePanel.current) {
      MarketplacePanel.current.panel.reveal(column);
      return MarketplacePanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      'Actions Marketplace',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // The panel has no local assets: markup, styles, and script are all
        // inlined behind a nonce CSP.
        localResourceRoots: []
      }
    );

    MarketplacePanel.current = new MarketplacePanel(panel, store);
    return MarketplacePanel.current;
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

      case 'search':
        this.lastSearch = message;
        await this.postResults(message);
        break;

      case 'copy':
        await vscode.env.clipboard.writeText(message.value);
        void vscode.window.setStatusBarMessage(`Copied: ${message.value}`, 3000);
        break;

      case 'open':
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
    }
  }

  private async postState(): Promise<void> {
    const status = this.store.getStatus();
    const index = this.store.getIndex();

    await this.panel.webview.postMessage({
      type: 'state',
      status,
      stats: index ? index.stats() : null
    });
  }

  private async postResults(message: SearchMessage): Promise<void> {
    const index = this.store.getIndex();
    if (!index) {
      await this.panel.webview.postMessage({ type: 'results', query: message.query, rows: [], total: 0 });
      return;
    }

    const filters: SearchFilters = {
      actionType: message.filters.actionType || undefined,
      owner: message.filters.owner || undefined,
      verifiedOnly: message.filters.verifiedOnly === true,
      includeArchived: message.filters.includeArchived === true,
      limit: RESULT_LIMIT
    };

    const results = index.search(message.query, filters);

    await this.panel.webview.postMessage({
      type: 'results',
      query: message.query,
      rows: results.map((result) => toRow(result)),
      total: results.length,
      truncated: results.length >= RESULT_LIMIT
    });
  }

  dispose(): void {
    MarketplacePanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function toRow(result: ActionSearchResult): SearchRow {
  return {
    ref: result.ref,
    owner: result.owner,
    name: result.name,
    latestVersion: result.latestVersion,
    latestSha: result.latestSha,
    shortSha: result.latestSha ? result.latestSha.slice(0, 10) : null,
    publishedAt: result.publishedAt,
    actionType: result.actionType,
    dependents: result.dependents,
    ossfScore: result.ossfScore,
    verified: result.verified,
    archived: result.archived,
    pinnedRef: result.latestSha
      ? formatPinnedRef(result.owner, result.name, null, result.latestSha, result.latestVersion)
      : `${result.ref}@${result.latestVersion ?? ''}`.replace(/@$/, ''),
    url: result.url
  };
}

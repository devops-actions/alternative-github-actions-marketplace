import * as vscode from 'vscode';

import type { DatasetStore } from './datasetStore';
import { MarketplacePanel } from './ui/marketplacePanel';
import { formatPinnedRef } from './data/actionRef';

interface ActionQuickPickItem extends vscode.QuickPickItem {
  pinnedRef: string;
  url: string;
}

/**
 * Quick-pick search, for when you want a ref without leaving the keyboard.
 *
 * Results are computed on each keystroke against the in-memory index, so this
 * stays responsive over the full dataset without paging.
 */
async function quickSearch(store: DatasetStore): Promise<void> {
  if (!store.getIndex()) {
    const choice = await vscode.window.showWarningMessage(
      'The marketplace dataset has not been downloaded yet.',
      'Download now'
    );
    if (choice === 'Download now') {
      await vscode.commands.executeCommand('actionsMarketplace.refresh');
    }
    return;
  }

  const picker = vscode.window.createQuickPick<ActionQuickPickItem>();
  picker.title = 'Search GitHub Actions';
  picker.placeholder = 'Search by owner or action name';
  picker.matchOnDescription = true;
  // The index already ranks and filters; VS Code's own filtering would fight it.
  picker.ignoreFocusOut = false;

  const update = (): void => {
    const index = store.getIndex();
    if (!index) {
      picker.items = [];
      return;
    }

    picker.items = index.search(picker.value, { limit: 30, includeArchived: true }).map((result) => ({
      label: result.ref,
      description: result.latestVersion ?? 'no published version',
      detail: [
        result.latestSha ? `SHA ${result.latestSha.slice(0, 10)}` : 'no commit SHA in dataset',
        result.publishedAt ? `published ${result.publishedAt.slice(0, 10)}` : 'publish date unknown',
        result.actionType ?? 'unknown type',
        `${(result.dependents ?? 0).toLocaleString('en-US')} dependents`,
        result.archived ? 'ARCHIVED' : ''
      ].filter(Boolean).join(' · '),
      pinnedRef: result.latestSha
        ? formatPinnedRef(result.owner, result.name, null, result.latestSha, result.latestVersion)
        : `${result.ref}${result.latestVersion ? `@${result.latestVersion}` : ''}`,
      url: result.url
    }));
  };

  picker.onDidChangeValue(update);
  picker.onDidAccept(async () => {
    const selected = picker.selectedItems[0];
    picker.hide();
    if (!selected) {
      return;
    }

    const action = await vscode.window.showQuickPick(
      [
        { label: '$(clippy) Copy reference', value: 'copy', description: selected.pinnedRef },
        { label: '$(edit) Insert at cursor', value: 'insert', description: selected.pinnedRef },
        { label: '$(link-external) Open on the marketplace site', value: 'open', description: selected.url }
      ],
      { title: selected.label }
    );

    if (action?.value === 'copy') {
      await vscode.env.clipboard.writeText(selected.pinnedRef);
      vscode.window.setStatusBarMessage(`Copied: ${selected.pinnedRef}`, 3000);
    } else if (action?.value === 'insert') {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage('No active editor to insert into.');
        return;
      }
      await editor.edit((builder) => {
        for (const selection of editor.selections) {
          builder.replace(selection, selected.pinnedRef);
        }
      });
    } else if (action?.value === 'open') {
      await vscode.env.openExternal(vscode.Uri.parse(selected.url));
    }
  });

  picker.onDidHide(() => picker.dispose());
  update();
  picker.show();
}

async function refresh(store: DatasetStore): Promise<void> {
  const outcome = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Downloading GitHub Actions marketplace dataset' },
    () => store.sync({ force: true })
  );

  switch (outcome.result) {
    case 'updated':
      void vscode.window.showInformationMessage(
        `Actions Marketplace: dataset updated (${outcome.count.toLocaleString('en-US')} actions).`
      );
      break;
    case 'unchanged':
      void vscode.window.showInformationMessage('Actions Marketplace: dataset is already up to date.');
      break;
    case 'skipped':
      void vscode.window.showInformationMessage(`Actions Marketplace: ${outcome.reason}`);
      break;
    case 'failed': {
      const choice = await vscode.window.showErrorMessage(
        `Actions Marketplace: refresh failed. ${outcome.error}`,
        'Open settings',
        'Show log'
      );
      if (choice === 'Open settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'actionsMarketplace.apiBaseUrl');
      } else if (choice === 'Show log') {
        await vscode.commands.executeCommand('workbench.action.output.toggleOutput');
      }
      break;
    }
  }
}

async function showDatasetInfo(store: DatasetStore, output: vscode.LogOutputChannel): Promise<void> {
  const status = store.getStatus();
  const index = store.getIndex();

  if (!index) {
    const choice = await vscode.window.showWarningMessage(
      status.lastError
        ? `No dataset cached. Last error: ${status.lastError}`
        : 'No dataset cached yet.',
      'Download now'
    );
    if (choice === 'Download now') {
      await refresh(store);
    }
    return;
  }

  const stats = index.stats();
  const shaPercent = stats.withLatestVersion > 0
    ? Math.round((stats.withSha / stats.withLatestVersion) * 100)
    : 0;

  output.info([
    'Dataset info',
    `  actions: ${stats.total}`,
    `  generated: ${status.generatedAt} (${status.age})`,
    `  last synced: ${status.lastSyncedAt}`,
    `  with a published version: ${stats.withLatestVersion}`,
    `  with a commit SHA: ${stats.withSha} (${shaPercent}%)`,
    `  verified: ${stats.verified}`,
    `  archived: ${stats.archived}`,
    `  by type: ${JSON.stringify(stats.byType)}`
  ].join('\n'));
  output.show(true);
}

const STATE_OF_ACTIONS_URL = 'https://alternative-github-actions-marketplace.devopsjournal.io/state';

export function registerCommands(
  store: DatasetStore,
  output: vscode.LogOutputChannel
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('actionsMarketplace.open', () => {
      MarketplacePanel.show(store);
    }),
    vscode.commands.registerCommand('actionsMarketplace.quickSearch', () => quickSearch(store)),
    vscode.commands.registerCommand('actionsMarketplace.refresh', () => refresh(store)),
    vscode.commands.registerCommand('actionsMarketplace.showDatasetInfo', () => showDatasetInfo(store, output)),
    vscode.commands.registerCommand('actionsMarketplace.openStateOfActions', () =>
      vscode.env.openExternal(vscode.Uri.parse(STATE_OF_ACTIONS_URL)))
  ];
}

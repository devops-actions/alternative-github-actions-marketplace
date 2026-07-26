import * as vscode from 'vscode';

import { DatasetStore } from './datasetStore';
import { registerCommands } from './commands';
import { registerTools } from './tools/registerTools';
import { DatasetStatusBar } from './ui/statusBar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Actions Marketplace', { log: true });
  context.subscriptions.push(output);

  const store = new DatasetStore(context, output);
  context.subscriptions.push(store);

  // Tools are registered before the dataset loads: a tool call is allowed to
  // trigger the download itself, and an unregistered tool would instead leave the
  // agent to answer from memory.
  context.subscriptions.push(...registerTools(store, output));
  context.subscriptions.push(new DatasetStatusBar(store));
  context.subscriptions.push(...registerCommands(store, output));

  await store.initialize();
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}

import * as vscode from 'vscode';

import { readConfig } from './config';
import { ActionIndex } from './data/actionIndex';
import { ApiError, MarketplaceApiClient } from './data/apiClient';
import { decodeSnapshot } from './data/snapshot';
import { describeAge, shouldRefresh } from './data/refreshPolicy';

const CACHE_FILE_NAME = 'actions-snapshot.json';
const STATE_KEY = 'actionsMarketplace.datasetState';

interface PersistedState {
  etag: string | null;
  /** When the server generated the snapshot. */
  generatedAt: string | null;
  /** When this client last successfully synced. */
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  lastAttemptFailed: boolean;
  lastError: string | null;
  count: number | null;
}

const EMPTY_STATE: PersistedState = {
  etag: null,
  generatedAt: null,
  lastSyncedAt: null,
  lastAttemptAt: null,
  lastAttemptFailed: false,
  lastError: null,
  count: null
};

export interface DatasetStatus {
  /** True once an index is loaded and queryable. */
  ready: boolean;
  count: number;
  /** When the server built the snapshot. */
  generatedAt: string | null;
  /** When this machine last downloaded or revalidated it. */
  lastSyncedAt: string | null;
  lastError: string | null;
  refreshing: boolean;
  /** Human-readable dataset age, for status text and tool output. */
  age: string;
}

export type SyncOutcome =
  | { result: 'updated'; count: number }
  | { result: 'unchanged' }
  | { result: 'skipped'; reason: string }
  | { result: 'failed'; error: string };

/**
 * Owns the cached dataset: on-disk snapshot, refresh scheduling, and the
 * in-memory index built from it.
 *
 * The snapshot is a few megabytes, so it lives as a file under
 * `globalStorageUri` rather than in `globalState`, which is a key-value store
 * not meant for payloads this size. Only the small sync bookkeeping goes into
 * `globalState`.
 */
export class DatasetStore implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;

  private index: ActionIndex | null = null;
  private refreshing = false;
  private inFlight: Promise<SyncOutcome> | null = null;
  private disposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.LogOutputChannel
  ) {}

  dispose(): void {
    this.disposed = true;
    this.changeEmitter.dispose();
  }

  /** The queryable index, or null until a dataset has been loaded. */
  getIndex(): ActionIndex | null {
    return this.index;
  }

  getStatus(): DatasetStatus {
    const state = this.readState();
    return {
      ready: this.index !== null,
      count: this.index?.size ?? state.count ?? 0,
      generatedAt: state.generatedAt,
      lastSyncedAt: state.lastSyncedAt,
      lastError: state.lastError,
      refreshing: this.refreshing,
      age: describeAge(state.generatedAt)
    };
  }

  /**
   * Loads the cached snapshot from disk, then refreshes in the background if it
   * is due. Never throws: activation must not fail because a cache file is
   * missing or the network is down.
   */
  async initialize(): Promise<void> {
    await this.loadFromDisk();

    const config = readConfig();
    const state = this.readState();
    const decision = shouldRefresh(
      {
        lastSyncedAt: state.lastSyncedAt,
        lastAttemptAt: state.lastAttemptAt,
        lastAttemptFailed: state.lastAttemptFailed,
        hasData: this.index !== null
      },
      { autoRefresh: config.autoRefresh, intervalHours: config.refreshIntervalHours }
    );

    this.output.info(`Dataset refresh check: ${decision.reason}`);

    if (decision.shouldRefresh) {
      // Deliberately not awaited: activation should not wait on a download.
      void this.sync({ force: false });
    }
  }

  /**
   * Refreshes the dataset.
   *
   * Concurrent callers share one request - the panel, the status bar, and a tool
   * invocation can all ask at once during startup.
   */
  async sync(options: { force: boolean }): Promise<SyncOutcome> {
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.performSync(options).finally(() => {
      this.inFlight = null;
      this.refreshing = false;
      this.changeEmitter.fire();
    });

    return this.inFlight;
  }

  private async performSync(options: { force: boolean }): Promise<SyncOutcome> {
    const config = readConfig();

    if (!config.apiBaseUrl) {
      const error = `No API base URL configured. Set "${'actionsMarketplace.apiBaseUrl'}".`;
      this.output.error(error);
      return { result: 'failed', error };
    }

    if (!options.force) {
      const state = this.readState();
      const decision = shouldRefresh(
        {
          lastSyncedAt: state.lastSyncedAt,
          lastAttemptAt: state.lastAttemptAt,
          lastAttemptFailed: state.lastAttemptFailed,
          hasData: this.index !== null
        },
        { autoRefresh: config.autoRefresh, intervalHours: config.refreshIntervalHours }
      );

      if (!decision.shouldRefresh) {
        return { result: 'skipped', reason: decision.reason };
      }
    }

    this.refreshing = true;
    this.changeEmitter.fire();

    const previous = this.readState();
    const attemptAt = new Date().toISOString();

    try {
      const client = new MarketplaceApiClient({
        baseUrl: config.apiBaseUrl,
        timeoutMs: config.requestTimeoutMs
      });

      // Only send the cached ETag when we actually still have the data it
      // describes; otherwise a 304 would leave us with no dataset at all.
      const etag = this.index !== null ? previous.etag : null;
      this.output.info(`Fetching dataset snapshot${etag ? ' (conditional)' : ''} from ${config.apiBaseUrl}`);

      const response = await client.fetchSnapshot(etag);

      if (response.status === 'not-modified') {
        await this.writeState({
          ...previous,
          etag: response.etag ?? previous.etag,
          generatedAt: response.generatedAt ?? previous.generatedAt,
          lastSyncedAt: attemptAt,
          lastAttemptAt: attemptAt,
          lastAttemptFailed: false,
          lastError: null
        });
        this.output.info('Dataset is already up to date (304 Not Modified).');
        return { result: 'unchanged' };
      }

      await this.persistSnapshot(response.rawJson);
      this.index = new ActionIndex(response.snapshot);

      await this.writeState({
        etag: response.etag,
        generatedAt: response.snapshot.generatedAt,
        lastSyncedAt: attemptAt,
        lastAttemptAt: attemptAt,
        lastAttemptFailed: false,
        lastError: null,
        count: response.snapshot.entries.length
      });

      this.output.info(
        `Dataset updated: ${response.snapshot.entries.length} actions, generated ${response.snapshot.generatedAt}.`
      );
      return { result: 'updated', count: response.snapshot.entries.length };
    } catch (error) {
      const message = error instanceof ApiError || error instanceof Error ? error.message : String(error);
      await this.writeState({
        ...previous,
        lastAttemptAt: attemptAt,
        lastAttemptFailed: true,
        lastError: message
      });
      this.output.error(`Dataset refresh failed: ${message}`);
      // The previously cached index stays in place, so a failed refresh degrades
      // to stale data rather than to no data.
      return { result: 'failed', error: message };
    }
  }

  private cacheFileUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, CACHE_FILE_NAME);
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.cacheFileUri());
      const snapshot = decodeSnapshot(JSON.parse(new TextDecoder().decode(bytes)));
      this.index = new ActionIndex(snapshot);
      this.output.info(`Loaded cached dataset: ${snapshot.entries.length} actions, generated ${snapshot.generatedAt}.`);
      this.changeEmitter.fire();
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError)) {
        // A corrupt or unreadable cache is not fatal; it just means we resync.
        this.output.warn(`Could not load cached dataset: ${error instanceof Error ? error.message : String(error)}`);
      }
      this.index = null;
    }
  }

  /**
   * Caches the server's response body verbatim.
   *
   * Storing the raw wire format rather than re-serializing the decoded entries
   * means a load from disk runs the exact same decode path as a fresh download,
   * so the two can never drift apart when a field is added.
   */
  private async persistSnapshot(rawJson: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    await vscode.workspace.fs.writeFile(this.cacheFileUri(), new TextEncoder().encode(rawJson));
  }

  private readState(): PersistedState {
    return { ...EMPTY_STATE, ...this.context.globalState.get<PersistedState>(STATE_KEY, EMPTY_STATE) };
  }

  private async writeState(state: PersistedState): Promise<void> {
    if (this.disposed) {
      return;
    }
    await this.context.globalState.update(STATE_KEY, state);
  }

  /** Clears the cached dataset. Used by the "refresh" path when data is corrupt. */
  async clear(): Promise<void> {
    this.index = null;
    await this.writeState(EMPTY_STATE);
    try {
      await vscode.workspace.fs.delete(this.cacheFileUri());
    } catch {
      // Nothing cached: fine.
    }
    this.changeEmitter.fire();
  }
}

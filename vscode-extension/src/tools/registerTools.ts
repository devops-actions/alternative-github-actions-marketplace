import * as vscode from 'vscode';

import { readConfig } from '../config';
import { MarketplaceApiClient } from '../data/apiClient';
import { parseActionRef, isRefError } from '../data/actionRef';
import type { DatasetStore } from '../datasetStore';
import type { SearchFilters } from '../data/actionIndex';
import {
  formatActionDetail,
  formatNoDataset,
  formatResolutions,
  formatSearchResults,
  formatStats,
  type DatasetProvenance
} from './format';

export const TOOL_RESOLVE_VERSIONS = 'actions-marketplace_resolveActionVersions';
export const TOOL_SEARCH = 'actions-marketplace_searchActions';
export const TOOL_DETAILS = 'actions-marketplace_getActionDetails';
export const TOOL_STATS = 'actions-marketplace_getDatasetStats';

interface ResolveInput {
  actions?: unknown;
}

interface SearchInput {
  query?: unknown;
  actionType?: unknown;
  owner?: unknown;
  verifiedOnly?: unknown;
  includeArchived?: unknown;
  limit?: unknown;
}

interface DetailsInput {
  action?: unknown;
}

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

function provenanceOf(store: DatasetStore): DatasetProvenance {
  const status = store.getStatus();
  return { generatedAt: status.generatedAt, age: status.age, count: status.count };
}

/**
 * Makes sure a dataset is loaded before a tool answers.
 *
 * A tool call is the one moment where waiting for a download is the right
 * trade-off: answering "I don't know" when the data is one request away would
 * push the model towards guessing, which is the exact failure this extension
 * exists to prevent.
 */
async function ensureDataset(store: DatasetStore): Promise<string | null> {
  if (store.getIndex()) {
    return null;
  }

  const outcome = await store.sync({ force: true });
  if (store.getIndex()) {
    return null;
  }

  if (outcome.result === 'failed') {
    return outcome.error;
  }
  if (outcome.result === 'skipped') {
    return outcome.reason;
  }
  return 'The dataset could not be loaded.';
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return [];
}

function registerResolveVersionsTool(store: DatasetStore): vscode.Disposable {
  return vscode.lm.registerTool<ResolveInput>(TOOL_RESOLVE_VERSIONS, {
    prepareInvocation(options) {
      const count = toStringArray(options.input.actions).length;
      return {
        invocationMessage: count === 1
          ? 'Looking up the latest GitHub Action version'
          : `Looking up the latest versions of ${count} GitHub Actions`
      };
    },

    async invoke(options) {
      const refs = toStringArray(options.input.actions);
      if (refs.length === 0) {
        return textResult('No action references were supplied. Provide at least one reference such as "actions/checkout@v4".');
      }

      const error = await ensureDataset(store);
      if (error) {
        return textResult(formatNoDataset(error));
      }

      const index = store.getIndex();
      if (!index) {
        return textResult(formatNoDataset(null));
      }

      return textResult(formatResolutions(index.resolveMany(refs), provenanceOf(store)));
    }
  });
}

function registerSearchTool(store: DatasetStore): vscode.Disposable {
  return vscode.lm.registerTool<SearchInput>(TOOL_SEARCH, {
    prepareInvocation(options) {
      const query = typeof options.input.query === 'string' ? options.input.query : '';
      return { invocationMessage: `Searching the GitHub Actions marketplace for "${query}"` };
    },

    async invoke(options) {
      const query = typeof options.input.query === 'string' ? options.input.query.trim() : '';
      if (!query) {
        return textResult('No search query was supplied.');
      }

      const error = await ensureDataset(store);
      if (error) {
        return textResult(formatNoDataset(error));
      }

      const index = store.getIndex();
      if (!index) {
        return textResult(formatNoDataset(null));
      }

      const filters: SearchFilters = {
        actionType: typeof options.input.actionType === 'string' ? options.input.actionType : undefined,
        owner: typeof options.input.owner === 'string' ? options.input.owner : undefined,
        verifiedOnly: options.input.verifiedOnly === true,
        includeArchived: options.input.includeArchived === true,
        limit: typeof options.input.limit === 'number' ? options.input.limit : undefined
      };

      return textResult(formatSearchResults(query, index.search(query, filters), provenanceOf(store)));
    }
  });
}

function registerDetailsTool(store: DatasetStore): vscode.Disposable {
  return vscode.lm.registerTool<DetailsInput>(TOOL_DETAILS, {
    prepareInvocation(options) {
      const ref = typeof options.input.action === 'string' ? options.input.action : 'an action';
      return { invocationMessage: `Fetching marketplace details for ${ref}` };
    },

    async invoke(options) {
      const parsed = parseActionRef(options.input.action);
      if (isRefError(parsed)) {
        return textResult(`Cannot read the action reference: ${parsed.error}`);
      }

      const config = readConfig();
      const ref = `${parsed.owner}/${parsed.name}`;

      // The detail endpoint carries the full version history, which the snapshot
      // deliberately omits, so try the API first and fall back to cached data.
      if (config.apiBaseUrl) {
        try {
          const client = new MarketplaceApiClient({
            baseUrl: config.apiBaseUrl,
            timeoutMs: Math.min(config.requestTimeoutMs, 30_000)
          });
          const detail = await client.fetchActionDetail(parsed.owner, parsed.name);

          if (detail) {
            return textResult(formatActionDetail(ref, detail, provenanceOf(store), 'api'));
          }

          // A 404 is authoritative: the action is not in the marketplace.
          return textResult(
            `"${ref}" is not in the alternative GitHub Actions marketplace. `
            + 'It may be a private action, a local action, or not published. Do not invent a version for it.'
          );
        } catch {
          // Fall through to the cached snapshot below.
        }
      }

      const error = await ensureDataset(store);
      if (error) {
        return textResult(formatNoDataset(error));
      }

      const index = store.getIndex();
      const entry = index?.get(parsed.owner, parsed.name, parsed.subPath);
      if (!index || !entry) {
        return textResult(
          `The marketplace API is unreachable and "${ref}" is not in the cached dataset, `
          + 'so no version information is available. Do not guess a version.'
        );
      }

      return textResult(formatActionDetail(
        ref,
        {
          owner: entry.owner,
          name: entry.name,
          actionType: { actionType: entry.actionType },
          repoInfo: {
            archived: entry.archived,
            disabled: entry.disabled,
            latest_release_published_at: entry.publishedAt
          },
          dependents: { dependents: entry.dependents },
          verified: entry.verified,
          ossfScore: entry.ossfScore,
          releaseInfo: entry.latestVersion ? [entry.latestVersion] : [],
          tagInfo: [
            ...(entry.latestVersion && entry.latestSha ? [{ tag: entry.latestVersion, sha: entry.latestSha }] : []),
            ...Object.entries(entry.floatingTags).map(([tag, sha]) => ({ tag, sha }))
          ]
        },
        provenanceOf(store),
        'cache'
      ));
    }
  });
}

function registerStatsTool(store: DatasetStore): vscode.Disposable {
  return vscode.lm.registerTool<Record<string, never>>(TOOL_STATS, {
    prepareInvocation() {
      return { invocationMessage: 'Reading GitHub Actions marketplace statistics' };
    },

    async invoke() {
      const error = await ensureDataset(store);
      if (error) {
        return textResult(formatNoDataset(error));
      }

      const index = store.getIndex();
      if (!index) {
        return textResult(formatNoDataset(null));
      }

      return textResult(formatStats(index.stats(), provenanceOf(store)));
    }
  });
}

/**
 * Registers every language model tool.
 *
 * `vscode.lm` is missing on older hosts, so registration is guarded rather than
 * assumed - the rest of the extension still works without it.
 */
export function registerTools(store: DatasetStore, output: vscode.LogOutputChannel): vscode.Disposable[] {
  if (!vscode.lm || typeof vscode.lm.registerTool !== 'function') {
    output.warn('This VS Code version does not support language model tools; AI integration is unavailable.');
    return [];
  }

  const disposables = [
    registerResolveVersionsTool(store),
    registerSearchTool(store),
    registerDetailsTool(store),
    registerStatsTool(store)
  ];

  output.info(`Registered ${disposables.length} language model tools for AI agents.`);
  return disposables;
}

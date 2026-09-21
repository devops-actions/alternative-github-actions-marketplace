import { Action } from '../types/Action';

export function splitOwnerRepo(a: Partial<Action> | { owner?: string; name?: string }) {
  const owner = (a && (a as any).owner) || '';
  let repo = (a && (a as any).name) || '';
  if (owner && repo && repo.startsWith(`${owner}_`)) {
    repo = repo.substring(owner.length + 1);
  }
  return { owner, repo };
}

export function normalizeRepoName(owner?: string, name?: string) {
  if (!name) return '';
  if (owner && name.startsWith(`${owner}_`)) {
    return name.substring(owner.length + 1);
  }
  return name;
}

export default { splitOwnerRepo, normalizeRepoName };

export interface SearchableAction {
  owner?: string;
  name?: string;
  actionType?: string;
  verified?: boolean;
  archived?: boolean;
  description?: string | null;
}

// Kept in lockstep with the VS Code extension's ActionIndex.search matching
// logic (vscode-extension/src/data/actionIndex.ts) so a query typed on the
// website returns the same matches as the same query in the extension.
export function matchesSearchQuery(item: SearchableAction, rawQuery?: string) {
  if (!rawQuery) return true;
  const q = String(rawQuery).trim().toLowerCase();
  if (!q) return true;

  // Normalize searchable text: owner, name, type, verified/archived state,
  // and description, replace non-alphanum with spaces
  const owner = String(item.owner || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  const actionType = String(item.actionType || '').toLowerCase();
  const description = String(item.description || '').toLowerCase();
  const flags = [item.verified ? 'verified' : '', item.archived ? 'archived' : ''].join(' ');
  const searchable = `${owner} ${name} ${actionType} ${flags} ${description}`
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  // Normalize query: replace non-alphanum with space and split tokens
  const tokens = q.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  // Every token must appear somewhere in the searchable string
  return tokens.every(t => searchable.includes(t));
}

export function isActionVerified(action: Partial<Action> | { verified?: unknown }) {
  const v = (action && (action as any).verified) as unknown;
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    return s === 'true' || s === '1';
  }
  return false;
}

// GitHub-owned actions live under these orgs (e.g. actions/checkout, github/codeql-action).
const GITHUB_OWNED_ORGS = new Set(['actions', 'github']);

export function isGitHubOwnedAction(action: Partial<Action> | { owner?: string }) {
  const owner = String((action && (action as any).owner) || '').toLowerCase().trim();
  return GITHUB_OWNED_ORGS.has(owner);
}

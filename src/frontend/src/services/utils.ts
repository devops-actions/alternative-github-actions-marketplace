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

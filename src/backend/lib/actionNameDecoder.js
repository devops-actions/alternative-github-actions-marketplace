/**
 * Extracts the GitHub repository name from the combined action name.
 *
 * The data pipeline (GetForkedRepoName in library.ps1) encodes action names as
 * `{owner}_{repoName}` where any slashes in composite action paths are replaced
 * with underscores. For example:
 *   - actions/setup-java        → "actions_setup-java"
 *   - github/codeql-action/analyze → "github_codeql-action_analyze"
 *
 * GitHub org names cannot contain underscores, so the first underscore always
 * separates the owner from the rest of the path. For composite actions, only the
 * repository name (first path segment) is returned since the GitHub repos API
 * (`/repos/{owner}/{repo}/readme`) expects just the repository name.
 *
 * @param {string} owner - GitHub organization or user name
 * @param {string} name  - Combined action name in {owner}_{repo} format
 * @returns {string} The GitHub repository name
 */
function extractRepoName(owner, name) {
  const prefix = owner + '_';
  if (!name.startsWith(prefix)) {
    return name; // fallback: use name as-is
  }
  // Strip owner prefix, restore slash encoding, take only the repo name (first segment)
  const repoPath = name.substring(prefix.length).replace(/_/g, '/');
  return repoPath.split('/')[0];
}

module.exports = { extractRepoName };

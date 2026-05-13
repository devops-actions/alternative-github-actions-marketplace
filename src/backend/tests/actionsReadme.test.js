const { extractRepoName } = require('../lib/actionNameDecoder');

describe('actionsReadme', () => {
  describe('extractRepoName', () => {
    it('should strip the owner prefix from a simple repo name', () => {
      expect(extractRepoName('actions', 'actions_setup-java')).toBe('setup-java');
    });

    it('should handle repos with hyphens', () => {
      expect(extractRepoName('actions', 'actions_checkout')).toBe('checkout');
    });

    it('should return only the repo name for composite action paths', () => {
      // github/codeql-action/analyze → stored as github_codeql-action_analyze
      expect(extractRepoName('github', 'github_codeql-action_analyze')).toBe('codeql-action');
    });

    it('should return only the repo name for deep composite paths', () => {
      // org/repo/.github/actions/my-action → org_repo_.github_actions_my-action
      expect(extractRepoName('org', 'org_repo_.github_actions_my-action')).toBe('repo');
    });

    it('should fall back to name as-is when no owner prefix found', () => {
      expect(extractRepoName('actions', 'no-prefix-here')).toBe('no-prefix-here');
    });

    it('should handle case where owner appears at start but no underscore', () => {
      expect(extractRepoName('myorg', 'myorg')).toBe('myorg');
    });
  });
});

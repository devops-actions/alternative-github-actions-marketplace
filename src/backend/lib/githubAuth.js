const { createAppAuth } = require('@octokit/auth-app');

/**
 * Creates GitHub authentication headers supporting both PAT and GitHub App
 * @returns {Promise<Object>} Headers object with Authorization
 */
async function getGitHubAuthHeaders() {
  const headers = {
    'Accept': 'application/vnd.github.v3.html',
    'User-Agent': 'Alternative-GitHub-Actions-Marketplace'
  };

  // Try GitHub App authentication first
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
    try {
      const auth = createAppAuth({
        appId: process.env.GITHUB_APP_ID,
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
        installationId: process.env.GITHUB_APP_INSTALLATION_ID
      });

      const { token } = await auth({ type: 'installation' });
      headers['Authorization'] = `Bearer ${token}`;
      return headers;
    } catch (error) {
      console.error('Failed to authenticate with GitHub App:', error.message);
      // Fall through to PAT if GitHub App auth fails
    }
  }

  // Fall back to Personal Access Token
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

module.exports = {
  getGitHubAuthHeaders
};

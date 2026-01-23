const { getGitHubAuthHeaders } = require('../lib/githubAuth');

// Mock the @octokit/auth-app module
jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn()
}));

const { createAppAuth } = require('@octokit/auth-app');

describe('githubAuth', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getGitHubAuthHeaders', () => {
    it('should return basic headers when no auth is configured', async () => {
      const headers = await getGitHubAuthHeaders();
      
      expect(headers).toEqual({
        'Accept': 'application/vnd.github.v3.html',
        'User-Agent': 'Alternative-GitHub-Actions-Marketplace'
      });
      expect(headers.Authorization).toBeUndefined();
    });

    it('should use PAT when GITHUB_TOKEN is set', async () => {
      process.env.GITHUB_TOKEN = 'ghp_test_token';
      
      const headers = await getGitHubAuthHeaders();
      
      expect(headers.Authorization).toBe('Bearer ghp_test_token');
    });

    it('should use GitHub App when credentials are provided', async () => {
      process.env.GITHUB_APP_ID = '12345';
      process.env.GITHUB_APP_PRIVATE_KEY = 'fake-private-key';
      process.env.GITHUB_APP_INSTALLATION_ID = '67890';

      const mockAuth = jest.fn().mockResolvedValue({ token: 'ghs_app_token' });
      createAppAuth.mockReturnValue(mockAuth);

      const headers = await getGitHubAuthHeaders();

      expect(createAppAuth).toHaveBeenCalledWith({
        appId: '12345',
        privateKey: 'fake-private-key',
        installationId: '67890'
      });
      expect(mockAuth).toHaveBeenCalledWith({ type: 'installation' });
      expect(headers.Authorization).toBe('Bearer ghs_app_token');
    });

    it('should fall back to PAT if GitHub App auth fails', async () => {
      process.env.GITHUB_APP_ID = '12345';
      process.env.GITHUB_APP_PRIVATE_KEY = 'fake-private-key';
      process.env.GITHUB_APP_INSTALLATION_ID = '67890';
      process.env.GITHUB_TOKEN = 'ghp_fallback_token';

      const mockAuth = jest.fn().mockRejectedValue(new Error('App auth failed'));
      createAppAuth.mockReturnValue(mockAuth);

      // Mock console.error to avoid test output noise
      const originalError = console.error;
      console.error = jest.fn();

      const headers = await getGitHubAuthHeaders();

      expect(headers.Authorization).toBe('Bearer ghp_fallback_token');
      expect(console.error).toHaveBeenCalledWith(
        'Failed to authenticate with GitHub App:',
        'App auth failed'
      );

      console.error = originalError;
    });

    it('should prefer GitHub App over PAT when both are available', async () => {
      process.env.GITHUB_APP_ID = '12345';
      process.env.GITHUB_APP_PRIVATE_KEY = 'fake-private-key';
      process.env.GITHUB_APP_INSTALLATION_ID = '67890';
      process.env.GITHUB_TOKEN = 'ghp_token';

      const mockAuth = jest.fn().mockResolvedValue({ token: 'ghs_app_token' });
      createAppAuth.mockReturnValue(mockAuth);

      const headers = await getGitHubAuthHeaders();

      expect(headers.Authorization).toBe('Bearer ghs_app_token');
    });
  });
});

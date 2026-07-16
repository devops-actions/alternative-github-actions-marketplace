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

describe('actionsReadme function', () => {
  let actionsReadme;
  let mockGetActionEntity;
  let mockGetCachedReadme;
  let mockCacheReadme;
  let mockIsCacheValid;
  let mockGetGitHubAuthHeaders;

  beforeEach(() => {
    jest.resetModules();

    mockGetActionEntity = jest.fn();
    mockGetCachedReadme = jest.fn();
    mockCacheReadme = jest.fn();
    mockIsCacheValid = jest.fn();
    mockGetGitHubAuthHeaders = jest.fn().mockResolvedValue({});

    jest.mock('../lib/tableStorage', () => ({
      getActionEntity: mockGetActionEntity
    }));

    jest.mock('../lib/readmeCache', () => ({
      getCachedReadme: mockGetCachedReadme,
      cacheReadme: mockCacheReadme,
      isCacheValid: mockIsCacheValid
    }));

    jest.mock('../lib/githubAuth', () => ({
      getPublicReadHeaders: mockGetGitHubAuthHeaders
    }));

    global.fetch = jest.fn();

    actionsReadme = require('../ActionsReadme');
  });

  afterEach(() => {
    delete global.fetch;
    jest.resetModules();
  });

  function createContext(owner, name) {
    return {
      log: Object.assign(jest.fn(), {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }),
      bindingData: { owner, name }
    };
  }

  it('returns 204 for OPTIONS request', async () => {
    const context = createContext('actions', 'checkout');
    const req = { method: 'OPTIONS', headers: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(204);
    expect(context.res.headers['Allow']).toBe('GET,OPTIONS');
  });

  it('returns 405 for non-GET/OPTIONS methods', async () => {
    const context = createContext('actions', 'checkout');
    const req = { method: 'POST', headers: {}, query: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(405);
    expect(context.res.body.error).toBe('Method not allowed.');
  });

  it('returns 400 when owner is missing', async () => {
    const context = createContext(undefined, 'checkout');
    const req = { method: 'GET', headers: {}, query: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(400);
    expect(context.res.body.error).toContain('required');
  });

  it('returns 400 when name is missing', async () => {
    const context = createContext('actions', undefined);
    const req = { method: 'GET', headers: {}, query: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(400);
    expect(context.res.body.error).toContain('required');
  });

  it('serves cached README when cache is valid', async () => {
    mockGetActionEntity.mockResolvedValue(null);
    const cachedEntry = { content: '<h1>README</h1>', cachedAt: new Date() };
    mockGetCachedReadme.mockResolvedValue(cachedEntry);
    mockIsCacheValid.mockReturnValue(true);

    const context = createContext('actions', 'checkout');
    const req = { method: 'GET', headers: {}, query: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body).toBe('<h1>README</h1>');
    expect(context.res.headers['X-Cache']).toBe('HIT');
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=1800');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches README from GitHub when cache is invalid', async () => {
    mockGetActionEntity.mockResolvedValue(null);
    mockGetCachedReadme.mockResolvedValue(null);
    mockIsCacheValid.mockReturnValue(false);
    mockCacheReadme.mockResolvedValue(undefined);

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('<h1>Fresh README</h1>')
    });

    const context = createContext('actions', 'checkout');
    const req = { method: 'GET', headers: {}, query: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body).toBe('<h1>Fresh README</h1>');
    expect(context.res.headers['X-Cache']).toBe('MISS');
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=1800');
  });

  it('returns 404 when GitHub returns 404', async () => {
    mockGetActionEntity.mockResolvedValue(null);
    mockGetCachedReadme.mockResolvedValue(null);

    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: jest.fn().mockResolvedValue('')
    });

    const context = createContext('actions', 'missing');
    const req = { method: 'GET', headers: {}, query: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(404);
    expect(context.res.body.error).toBe('README not found.');
    expect(context.res.headers['Cache-Control']).toBeUndefined();
  });

  it('returns 500 when GitHub returns non-ok non-404 error', async () => {
    mockGetActionEntity.mockResolvedValue(null);
    mockGetCachedReadme.mockResolvedValue(null);

    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: jest.fn().mockResolvedValue('')
    });

    const context = createContext('actions', 'checkout');
    const req = { method: 'GET', headers: {}, query: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(500);
    expect(context.res.body.error).toBe('Failed to fetch README.');
  });

  it('continues serving README even when caching fails', async () => {
    mockGetActionEntity.mockResolvedValue(null);
    mockGetCachedReadme.mockResolvedValue(null);
    mockCacheReadme.mockRejectedValue(new Error('cache write failed'));

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('<p>README content</p>')
    });

    const context = createContext('actions', 'checkout');
    const req = { method: 'GET', headers: {}, query: {} };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body).toBe('<p>README content</p>');
    expect(context.log.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to cache README'));
  });

  it('fetches README with a specific version from query param', async () => {
    mockGetActionEntity.mockResolvedValue(null);
    mockGetCachedReadme.mockResolvedValue(null);
    mockCacheReadme.mockResolvedValue(undefined);

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('<h2>v3 README</h2>')
    });

    const context = createContext('github', 'codeql-action');
    const req = { method: 'GET', headers: {}, query: { version: 'v3' } };

    await actionsReadme(context, req);

    expect(context.res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ref=v3'),
      expect.any(Object)
    );
  });
});

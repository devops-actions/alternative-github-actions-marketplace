const { getCachedReadme, cacheReadme, isCacheValid, getReadmePartitionKey, getReadmeRowKey } = require('../lib/readmeCache');

describe('readmeCache', () => {
  describe('getReadmePartitionKey', () => {
    it('should normalize owner and name to lowercase', () => {
      expect(getReadmePartitionKey('Actions', 'CheckOut')).toBe('actions-checkout');
    });

    it('should handle special characters', () => {
      expect(getReadmePartitionKey('My-Org', 'My-Action')).toBe('my-org-my-action');
    });
  });

  describe('getReadmeRowKey', () => {
    it('should normalize version to lowercase', () => {
      expect(getReadmeRowKey('V1.0.0')).toBe('v1.0.0');
    });

    it('should default to main for undefined version', () => {
      expect(getReadmeRowKey(undefined)).toBe('main');
      expect(getReadmeRowKey(null)).toBe('main');
      expect(getReadmeRowKey('')).toBe('main');
    });
  });

  describe('isCacheValid', () => {
    it('should return false if no cached readme', () => {
      expect(isCacheValid(null, new Date())).toBe(false);
    });

    it('should return false if no content in cache', () => {
      const cached = { content: null, cachedAt: new Date(), repoUpdatedAt: new Date() };
      expect(isCacheValid(cached, new Date())).toBe(false);
    });

    it('should return true if repo has not been updated since cache', () => {
      const repoUpdated = new Date('2025-01-01T00:00:00Z');
      const cached = {
        content: '<h1>README</h1>',
        cachedAt: new Date('2025-01-02T00:00:00Z'),
        repoUpdatedAt: new Date('2025-01-01T00:00:00Z')
      };
      expect(isCacheValid(cached, repoUpdated)).toBe(true);
    });

    it('should return false if repo has been updated after cache', () => {
      const repoUpdated = new Date('2025-01-03T00:00:00Z');
      const cached = {
        content: '<h1>README</h1>',
        cachedAt: new Date('2025-01-02T00:00:00Z'),
        repoUpdatedAt: new Date('2025-01-01T00:00:00Z')
      };
      expect(isCacheValid(cached, repoUpdated)).toBe(false);
    });

    it('should use 1 hour timeout if no repo update times available', () => {
      const cached = {
        content: '<h1>README</h1>',
        cachedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        repoUpdatedAt: null
      };
      expect(isCacheValid(cached, null)).toBe(true);
    });

    it('should return false if cache is older than 1 hour and no repo times', () => {
      const cached = {
        content: '<h1>README</h1>',
        cachedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        repoUpdatedAt: null
      };
      expect(isCacheValid(cached, null)).toBe(false);
    });
  });

  describe('getCachedReadme', () => {
    it('should return null if entity not found', async () => {
      const mockClient = {
        getEntity: jest.fn().mockRejectedValue({ statusCode: 404 })
      };

      const result = await getCachedReadme('actions', 'checkout', 'v1', { tableClient: mockClient });
      expect(result).toBeNull();
      expect(mockClient.getEntity).toHaveBeenCalledWith('actions-checkout', 'v1');
    });

    it('should return cached readme with timestamps', async () => {
      const mockClient = {
        getEntity: jest.fn().mockResolvedValue({
          Content: '<h1>README</h1>',
          CachedAt: '2025-01-01T00:00:00Z',
          RepoUpdatedAt: '2024-12-31T00:00:00Z'
        })
      };

      const result = await getCachedReadme('actions', 'checkout', 'v1', { tableClient: mockClient });
      expect(result.content).toBe('<h1>README</h1>');
      expect(result.cachedAt).toEqual(new Date('2025-01-01T00:00:00Z'));
      expect(result.repoUpdatedAt).toEqual(new Date('2024-12-31T00:00:00Z'));
    });

    it('should throw on non-404 errors', async () => {
      const mockClient = {
        getEntity: jest.fn().mockRejectedValue(new Error('Network error'))
      };

      await expect(
        getCachedReadme('actions', 'checkout', 'v1', { tableClient: mockClient })
      ).rejects.toThrow('Network error');
    });
  });

  describe('cacheReadme', () => {
    it('should upsert entity with correct structure', async () => {
      const mockClient = {
        upsertEntity: jest.fn().mockResolvedValue({})
      };

      const repoUpdatedAt = new Date('2025-01-01T00:00:00Z');
      await cacheReadme('actions', 'checkout', 'v1', '<h1>README</h1>', repoUpdatedAt, { tableClient: mockClient });

      expect(mockClient.upsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'actions-checkout',
          rowKey: 'v1',
          Content: '<h1>README</h1>',
          RepoUpdatedAt: '2025-01-01T00:00:00.000Z',
          Owner: 'actions',
          Name: 'checkout',
          Version: 'v1'
        }),
        'Replace'
      );
    });

    it('should default version to main if not provided', async () => {
      const mockClient = {
        upsertEntity: jest.fn().mockResolvedValue({})
      };

      await cacheReadme('actions', 'checkout', null, '<h1>README</h1>', null, { tableClient: mockClient });

      expect(mockClient.upsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          Version: 'main'
        }),
        'Replace'
      );
    });
  });
});

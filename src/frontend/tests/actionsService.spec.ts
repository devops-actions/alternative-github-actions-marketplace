import { test, expect } from '@playwright/test';
import { ActionsService } from '../src/services/actionsService';

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function makeCountingFetch(): { fetchStub: FetchStub; getCallCount: () => number } {
  let callCount = 0;
  const fetchStub: FetchStub = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => `content-${callCount}`
    } as Response;
  };
  return { fetchStub, getCallCount: () => callCount };
}

test.describe('actionsService README client-side cache', () => {
  let originalFetch: typeof fetch;

  test.beforeEach(() => {
    originalFetch = global.fetch;
  });

  test.afterEach(() => {
    global.fetch = originalFetch;
  });

  test('a second call within the TTL does not hit the network again', async () => {
    const { fetchStub, getCallCount } = makeCountingFetch();
    global.fetch = fetchStub as typeof fetch;

    const service = new ActionsService();
    try {
      const first = await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(getCallCount()).toBe(1);
      expect(first).toBe('content-1');

      const second = await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(getCallCount()).toBe(1);
      expect(second).toBe('content-1');
    } finally {
      service.destroy();
    }
  });

  test('a call for a different version fetches again', async () => {
    const { fetchStub, getCallCount } = makeCountingFetch();
    global.fetch = fetchStub as typeof fetch;

    const service = new ActionsService();
    try {
      await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(getCallCount()).toBe(1);

      await service.fetchReadme('owner1', 'repo1', 'v2.0.0');
      expect(getCallCount()).toBe(2);
    } finally {
      service.destroy();
    }
  });

  test('a call for a different owner or name fetches again', async () => {
    const { fetchStub, getCallCount } = makeCountingFetch();
    global.fetch = fetchStub as typeof fetch;

    const service = new ActionsService();
    try {
      await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(getCallCount()).toBe(1);

      await service.fetchReadme('owner2', 'repo1', 'v1.0.0');
      expect(getCallCount()).toBe(2);

      await service.fetchReadme('owner1', 'repo2', 'v1.0.0');
      expect(getCallCount()).toBe(3);
    } finally {
      service.destroy();
    }
  });

  test('cache entry expires after the TTL and triggers a new fetch', async () => {
    const { fetchStub, getCallCount } = makeCountingFetch();
    global.fetch = fetchStub as typeof fetch;

    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;

    const service = new ActionsService();
    try {
      await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(getCallCount()).toBe(1);

      // Still within the 10-minute TTL.
      now += 9 * 60 * 1000;
      await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(getCallCount()).toBe(1);

      // Past the 10-minute TTL.
      now += 2 * 60 * 1000;
      const afterExpiry = await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(getCallCount()).toBe(2);
      expect(afterExpiry).toBe('content-2');
    } finally {
      Date.now = realNow;
      service.destroy();
    }
  });

  test('a 404 response is cached as a miss and is not retried within the TTL', async () => {
    let callCount = 0;
    global.fetch = (async () => {
      callCount += 1;
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => ''
      } as Response;
    }) as typeof fetch;

    const service = new ActionsService();
    try {
      const first = await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(callCount).toBe(1);
      expect(first).toBeNull();

      const second = await service.fetchReadme('owner1', 'repo1', 'v1.0.0');
      expect(callCount).toBe(1);
      expect(second).toBeNull();
    } finally {
      service.destroy();
    }
  });
});

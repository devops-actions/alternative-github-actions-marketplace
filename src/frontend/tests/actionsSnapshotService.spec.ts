import { test, expect } from '@playwright/test';
import { ActionsService } from '../src/services/actionsService';

type RequestLog = { url: string };

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const headers = new Map(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: 'OK',
    headers: {
      has: (name: string) => headers.has(name.toLowerCase()),
      get: (name: string) => headers.get(name.toLowerCase()) ?? null
    },
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

const SNAPSHOT_ACTION = {
  owner: 'actions',
  name: 'checkout',
  actionType: { actionType: 'Node', nodeVersion: '20' },
  repoInfo: { updated_at: '2026-07-20T00:00:00Z', archived: false },
  dependents: { dependents: '1000' },
  releaseInfo: ['v4.2.0'],
  verified: true,
  ossf: true,
  ossfScore: 8.4,
  vulnerabilityStatus: { critical: 0, high: 0 }
};

function stubFetch(handler: (url: string) => Response) {
  const requests: RequestLog[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push({ url });
    return handler(url);
  }) as typeof fetch;
  return requests;
}

test.describe('actionsService snapshot loading', () => {
  let originalFetch: typeof fetch;

  test.beforeEach(() => {
    originalFetch = global.fetch;
  });

  test.afterEach(() => {
    global.fetch = originalFetch;
  });

  test('loads the whole dataset from the snapshot endpoint', async () => {
    const requests = stubFetch(() =>
      jsonResponse({ version: 1, generatedAt: '2026-07-26T10:00:00Z', count: 1, items: [SNAPSHOT_ACTION] })
    );

    const service = new ActionsService();
    try {
      const actions = await service.fetchActions();

      expect(actions).toHaveLength(1);
      expect(actions[0].owner).toBe('actions');
      expect(requests.some(r => r.url.includes('/actions/snapshot'))).toBe(true);
      // The slow full-table scan must not be touched on the happy path.
      expect(requests.some(r => r.url.includes('/actions/list'))).toBe(false);
    } finally {
      service.destroy();
    }
  });

  test('exposes when the snapshot was built', async () => {
    stubFetch(() =>
      jsonResponse({ version: 1, generatedAt: '2026-07-26T10:00:00Z', count: 1, items: [SNAPSHOT_ACTION] })
    );

    const service = new ActionsService();
    try {
      await service.fetchActions();
      expect(service.getSnapshotGeneratedAt()).toBe('2026-07-26T10:00:00Z');
    } finally {
      service.destroy();
    }
  });

  test('falls back to /actions/list when no snapshot has been built yet', async () => {
    const requests = stubFetch((url) => {
      if (url.includes('/actions/snapshot')) {
        return jsonResponse({ error: 'Snapshot not available yet.' }, { status: 503 });
      }
      return jsonResponse([SNAPSHOT_ACTION], { headers: { 'x-actions-count': '1' } });
    });

    const service = new ActionsService();
    try {
      const actions = await service.fetchActions();

      expect(actions).toHaveLength(1);
      expect(requests.some(r => r.url.includes('/actions/snapshot'))).toBe(true);
      expect(requests.some(r => r.url.includes('/actions/list'))).toBe(true);
    } finally {
      service.destroy();
    }
  });

  test('surfaces a genuine snapshot failure instead of silently falling back', async () => {
    stubFetch((url) => {
      if (url.includes('/actions/snapshot')) {
        return jsonResponse({ error: 'boom' }, { status: 500 });
      }
      return jsonResponse([SNAPSHOT_ACTION]);
    });

    const service = new ActionsService();
    try {
      await expect(service.fetchActions()).rejects.toThrow();
    } finally {
      service.destroy();
    }
  });

  test('a second call within the refresh interval does not hit the network again', async () => {
    const requests = stubFetch(() =>
      jsonResponse({ version: 1, count: 1, items: [SNAPSHOT_ACTION] })
    );

    const service = new ActionsService();
    try {
      await service.fetchActions();
      const afterFirst = requests.length;

      await service.fetchActions();
      expect(requests.length).toBe(afterFirst);
    } finally {
      service.destroy();
    }
  });

  test('concurrent callers share one in-flight request', async () => {
    const requests = stubFetch(() =>
      jsonResponse({ version: 1, count: 1, items: [SNAPSHOT_ACTION] })
    );

    const service = new ActionsService();
    try {
      await Promise.all([service.fetchActions(), service.fetchActions(), service.fetchActions()]);
      expect(requests.filter(r => r.url.includes('/actions/snapshot'))).toHaveLength(1);
    } finally {
      service.destroy();
    }
  });

  test('normalises snapshot records into the shape the pages render', async () => {
    stubFetch(() =>
      jsonResponse({ version: 1, count: 1, items: [SNAPSHOT_ACTION] })
    );

    const service = new ActionsService();
    try {
      const [action] = await service.fetchActions();

      // The grid reads releaseInfo as an array and indexes [0] to show "Latest: …".
      expect(Array.isArray(action.releaseInfo)).toBe(true);
      expect(action.releaseInfo[0]).toBe('v4.2.0');
      expect(action.ossfScore).toBe(8.4);
      expect(action.repoInfo.archived).toBe(false);
      expect(action.actionType.actionType).toBe('Node');
    } finally {
      service.destroy();
    }
  });

  test('a bare-string releaseInfo is dropped, which is why the snapshot must send an array', async () => {
    // normalizeAction runs releaseInfo through normalizeStringArray, which
    // yields [] for anything that is not already an array. If the backend
    // projection ever flattens releaseInfo to a string, every card silently
    // loses its "Latest: …" line — this test pins that contract.
    stubFetch(() =>
      jsonResponse({
        version: 1,
        count: 1,
        items: [{ ...SNAPSHOT_ACTION, releaseInfo: 'v4.2.0' as unknown as string[] }]
      })
    );

    const service = new ActionsService();
    try {
      const [action] = await service.fetchActions();
      expect(action.releaseInfo).toEqual([]);
    } finally {
      service.destroy();
    }
  });
});

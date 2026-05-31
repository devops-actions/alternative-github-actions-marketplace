'use strict';

const { fetchAction, fetchActionsList } = require('../lib/backendClient');

function makeFetchResponse({ status, ok, json, text }) {
  return {
    status,
    ok,
    json: jest.fn().mockResolvedValue(json),
    text: jest.fn().mockResolvedValue(text || '')
  };
}

beforeEach(() => {
  delete process.env.BACKEND_API_URL;
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

describe('fetchAction', () => {
  test('returns parsed JSON on successful 200 response', async () => {
    const actionData = { owner: 'actions', name: 'checkout', releaseInfo: ['v4'] };
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 200, ok: true, json: actionData }));

    const result = await fetchAction('actions', 'checkout');
    expect(result).toEqual(actionData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/actions/actions/checkout'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('returns null for 404 response', async () => {
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 404, ok: false, json: null }));

    const result = await fetchAction('actions', 'missing');
    expect(result).toBeNull();
  });

  test('throws error for non-ok non-404 response', async () => {
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 500, ok: false, json: null }));

    await expect(fetchAction('actions', 'failing')).rejects.toThrow('Backend API returned 500');
  });

  test('throws error for 503 response', async () => {
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 503, ok: false, json: null }));

    await expect(fetchAction('myorg', 'myaction')).rejects.toThrow('503');
  });

  test('uses BACKEND_API_URL environment variable', async () => {
    process.env.BACKEND_API_URL = 'https://custom.api.example.com/api';
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 200, ok: true, json: {} }));

    // Re-require to pick up the env var (the module reads it at load time)
    jest.resetModules();
    const { fetchAction: fetchActionFresh } = require('../lib/backendClient');

    await fetchActionFresh('actions', 'checkout');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('custom.api.example.com'),
      expect.any(Object)
    );
  });

  test('encodes owner and name in URL', async () => {
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 200, ok: true, json: {} }));

    await fetchAction('my-org', 'my-action');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/actions/my-org/my-action'),
      expect.any(Object)
    );
  });
});

describe('fetchActionsList', () => {
  test('returns parsed JSON array on success', async () => {
    const list = [{ owner: 'actions', name: 'checkout' }, { owner: 'actions', name: 'setup-node' }];
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 200, ok: true, json: list }));

    const result = await fetchActionsList({ limit: 50 });
    expect(result).toEqual(list);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=50'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('uses default limit of 200 when not specified', async () => {
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 200, ok: true, json: [] }));

    await fetchActionsList();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=200'),
      expect.any(Object)
    );
  });

  test('throws error for non-ok response', async () => {
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 500, ok: false, json: null }));

    await expect(fetchActionsList()).rejects.toThrow('Backend API returned 500');
  });

  test('throws error for 503 response', async () => {
    global.fetch.mockResolvedValue(makeFetchResponse({ status: 503, ok: false, json: null }));

    await expect(fetchActionsList()).rejects.toThrow('503');
  });
});

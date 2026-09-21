import { describe, expect, it, vi } from 'vitest';

import { ApiError, MarketplaceApiClient, normalizeBaseUrl, type FetchLike } from '../src/data/apiClient';
import { decodeSnapshot } from '../src/data/snapshot';
import { envelope } from './helpers';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
}

function client(fetchImpl: FetchMock): MarketplaceApiClient {
  return new MarketplaceApiClient({
    baseUrl: 'https://api.example.com/api/',
    fetchImpl: fetchImpl as unknown as FetchLike,
    timeoutMs: 1000
  });
}

describe('normalizeBaseUrl', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeBaseUrl('  https://x/api//  ')).toBe('https://x/api');
  });

  it('handles nullish input', () => {
    expect(normalizeBaseUrl(undefined as unknown as string)).toBe('');
  });
});

describe('MarketplaceApiClient construction', () => {
  it('rejects an empty base url', () => {
    expect(() => new MarketplaceApiClient({ baseUrl: '   ' })).toThrow(ApiError);
  });
});

describe('fetchSnapshot', () => {
  it('requests the snapshot path against the normalized base url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(envelope([{ owner: 'o', name: 'n' }])));

    await client(fetchImpl).fetchSnapshot();

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.com/api/actions/versions');
  });

  it('sends If-None-Match when an etag is supplied', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { ETag: '"abc"' } }));

    const result = await client(fetchImpl).fetchSnapshot('"abc"');

    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('"abc"');
    expect(result).toEqual({ status: 'not-modified', etag: '"abc"', generatedAt: null });
  });

  it('omits If-None-Match when no etag is supplied', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(envelope([])));

    await client(fetchImpl).fetchSnapshot(null);

    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['If-None-Match']).toBeUndefined();
  });

  it('reads the generated-at header on a 304', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
      status: 304,
      headers: { ETag: '"abc"', 'X-Versions-Generated-At': '2026-07-26T04:30:00.000Z' }
    }));

    const result = await client(fetchImpl).fetchSnapshot('"abc"');

    expect(result).toMatchObject({ status: 'not-modified', generatedAt: '2026-07-26T04:30:00.000Z' });
  });

  it('decodes an updated snapshot and returns the new etag', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(envelope([{ owner: 'actions', name: 'checkout', latestVersion: 'v4' }]), { headers: { ETag: '"new"' } })
    );

    const result = await client(fetchImpl).fetchSnapshot('"old"');

    expect(result.status).toBe('updated');
    if (result.status === 'updated') {
      expect(result.etag).toBe('"new"');
      expect(result.snapshot.entries[0].name).toBe('checkout');
    }
  });

  it('returns the response body verbatim so callers can cache it unchanged', async () => {
    const payload = envelope([{ owner: 'actions', name: 'checkout', latestVersion: 'v4' }]);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(payload));

    const result = await client(fetchImpl).fetchSnapshot();

    expect(result.status).toBe('updated');
    if (result.status === 'updated') {
      expect(result.rawJson).toBe(JSON.stringify(payload));
      // Re-decoding the cached text must reproduce the same entries.
      expect(decodeSnapshot(JSON.parse(result.rawJson)).entries).toEqual(result.snapshot.entries);
    }
  });

  it('explains a 404 as a backend that predates the endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }));

    await expect(client(fetchImpl).fetchSnapshot()).rejects.toThrow(/predate the versions feed/);
  });

  it('marks a 503 as retryable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }));

    await expect(client(fetchImpl).fetchSnapshot()).rejects.toMatchObject({ statusCode: 503, retryable: true });
  });

  it('marks a 500 as retryable and a 400 as not', async () => {
    await expect(client(vi.fn().mockResolvedValue(new Response('', { status: 500 }))).fetchSnapshot())
      .rejects.toMatchObject({ retryable: true });
    await expect(client(vi.fn().mockResolvedValue(new Response('', { status: 400 }))).fetchSnapshot())
      .rejects.toMatchObject({ retryable: false });
  });

  it('reports invalid JSON as a retryable failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not json', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(client(fetchImpl).fetchSnapshot()).rejects.toThrow(/not valid JSON/);
  });

  it('surfaces a rejected snapshot format as an error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));

    await expect(client(fetchImpl).fetchSnapshot()).rejects.toThrow(/missing the "fields"/);
  });

  it('wraps a network failure with the url', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(client(fetchImpl).fetchSnapshot()).rejects.toThrow(/failed: ECONNREFUSED/);
  });

  it('reports a timeout distinctly', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    await expect(client(fetchImpl).fetchSnapshot()).rejects.toThrow(/timed out after 1000 ms/);
  });

  it('passes an abort signal so the request can be cancelled', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(envelope([])));

    await client(fetchImpl).fetchSnapshot();

    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('fetchActionDetail', () => {
  it('encodes owner and name into the path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ owner: 'actions', name: 'checkout' }));

    await client(fetchImpl).fetchActionDetail('act ions', 'check/out');

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.com/api/actions/act%20ions/check%2Fout');
  });

  it('returns null for a 404 so callers can tell "absent" from "failed"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 404 }));

    expect(await client(fetchImpl).fetchActionDetail('a', 'b')).toBeNull();
  });

  it('returns the payload on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ owner: 'actions', name: 'checkout' }));

    expect(await client(fetchImpl).fetchActionDetail('actions', 'checkout'))
      .toEqual({ owner: 'actions', name: 'checkout' });
  });

  it('throws for other error statuses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 500 }));

    await expect(client(fetchImpl).fetchActionDetail('a', 'b')).rejects.toThrow(/HTTP 500/);
  });
});

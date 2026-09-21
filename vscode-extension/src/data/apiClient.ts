/**
 * HTTP access to the marketplace API.
 *
 * `fetch` is injectable so the retry/conditional-request behaviour can be tested
 * without a network or a running Functions host.
 */

import { decodeSnapshot, type DecodedSnapshot } from './snapshot';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export type SnapshotFetchResult =
  | { status: 'not-modified'; etag: string | null; generatedAt: string | null }
  | {
      status: 'updated';
      etag: string | null;
      snapshot: DecodedSnapshot;
      /**
       * The response body exactly as received. Callers cache this rather than
       * re-serializing `snapshot`, so a load from disk goes through the same
       * decode path as a fresh download and cannot drift from it.
       */
      rawJson: string;
    };

export class ApiError extends Error {
  readonly statusCode: number | null;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number | null, retryable: boolean) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** Trims trailing slashes so path joining never produces a double slash. */
export function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl ?? '').trim().replace(/\/+$/, '');
}

export class MarketplaceApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: ApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));

    if (!this.baseUrl) {
      throw new ApiError('No API base URL is configured.', null, false);
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(init.headers ?? {}) }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new ApiError(
        aborted ? `Request to ${url} timed out after ${this.timeoutMs} ms.` : `Request to ${url} failed: ${message}`,
        null,
        true
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Downloads the dataset snapshot, or confirms the cached copy is still current.
   *
   * Passing the cached ETag turns the daily refresh into a conditional request:
   * the expected outcome is a 304 with no body.
   */
  async fetchSnapshot(etag?: string | null): Promise<SnapshotFetchResult> {
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    const response = await this.request('/actions/versions', { method: 'GET', headers });

    if (response.status === 304) {
      return {
        status: 'not-modified',
        etag: response.headers.get('etag') ?? etag ?? null,
        generatedAt: response.headers.get('x-versions-generated-at')
      };
    }

    if (response.status === 404) {
      throw new ApiError(
        'The API has no /actions/versions endpoint. The backend may predate the versions feed.',
        404,
        false
      );
    }

    if (response.status === 503) {
      throw new ApiError('The dataset snapshot is still being built on the server. Try again shortly.', 503, true);
    }

    if (!response.ok) {
      throw new ApiError(
        `Snapshot request failed with HTTP ${response.status}.`,
        response.status,
        response.status >= 500
      );
    }

    const rawJson = await response.text();

    let payload: unknown;
    try {
      payload = JSON.parse(rawJson);
    } catch (error) {
      throw new ApiError(
        `Snapshot response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        response.status,
        true
      );
    }

    return {
      status: 'updated',
      etag: response.headers.get('etag'),
      snapshot: decodeSnapshot(payload),
      rawJson
    };
  }

  /**
   * Fetches full metadata for a single action.
   *
   * Returns null for a 404 so callers can distinguish "not in the marketplace"
   * from "the request failed".
   */
  async fetchActionDetail(owner: string, name: string): Promise<Record<string, unknown> | null> {
    const path = `/actions/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const response = await this.request(path, { method: 'GET' });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new ApiError(
        `Action detail request failed with HTTP ${response.status}.`,
        response.status,
        response.status >= 500
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }
}

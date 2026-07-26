/**
 * Decides when the cached dataset should be refreshed.
 *
 * Split out from the store so the timing rules - which are easy to get subtly
 * wrong and annoying to debug through the UI - can be tested directly.
 */

export interface RefreshState {
  /** When a refresh last succeeded (ISO 8601), or null if never. */
  lastSyncedAt: string | null;
  /** When a refresh was last attempted, successful or not. */
  lastAttemptAt: string | null;
  /** Whether the last attempt failed. */
  lastAttemptFailed: boolean;
  /** Whether any usable dataset is cached. */
  hasData: boolean;
}

export interface RefreshOptions {
  autoRefresh: boolean;
  intervalHours: number;
  now?: Date;
}

export interface RefreshDecision {
  shouldRefresh: boolean;
  reason: string;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * How long to wait before retrying after a failure.
 *
 * Without this, every window reload after an outage would trigger another
 * multi-megabyte download attempt. An hour is long enough to be polite and short
 * enough that a transient outage does not cost a whole day of freshness.
 */
export const FAILURE_BACKOFF_MS = HOUR_MS;

/** Minimum interval the server can produce new data at: it rebuilds daily. */
export const MIN_INTERVAL_HOURS = 24;

function parseDate(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shouldRefresh(state: RefreshState, options: RefreshOptions): RefreshDecision {
  if (!options.autoRefresh) {
    return { shouldRefresh: false, reason: 'Automatic refresh is disabled in settings.' };
  }

  const now = (options.now ?? new Date()).getTime();
  const lastAttempt = parseDate(state.lastAttemptAt);

  if (state.lastAttemptFailed && lastAttempt !== null && now - lastAttempt < FAILURE_BACKOFF_MS) {
    const minutes = Math.ceil((FAILURE_BACKOFF_MS - (now - lastAttempt)) / 60_000);
    return { shouldRefresh: false, reason: `Last refresh failed; retrying in about ${minutes} minute(s).` };
  }

  if (!state.hasData) {
    return { shouldRefresh: true, reason: 'No dataset is cached yet.' };
  }

  const lastSynced = parseDate(state.lastSyncedAt);
  if (lastSynced === null) {
    return { shouldRefresh: true, reason: 'Cached dataset has no recorded sync time.' };
  }

  const intervalMs = Math.max(MIN_INTERVAL_HOURS, options.intervalHours) * HOUR_MS;
  const age = now - lastSynced;

  if (age >= intervalMs) {
    return { shouldRefresh: true, reason: `Cached dataset is ${formatAge(age)} old.` };
  }

  return {
    shouldRefresh: false,
    reason: `Cached dataset is ${formatAge(age)} old; next refresh in ${formatAge(intervalMs - age)}.`
  };
}

/** Formats a duration for human-readable status text. */
export function formatAge(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return 'unknown';
  }

  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) {
    return 'less than a minute';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** Formats the age of an ISO timestamp relative to now, for display. */
export function describeAge(isoTimestamp: string | null, now: Date = new Date()): string {
  const parsed = parseDate(isoTimestamp);
  if (parsed === null) {
    return 'never';
  }
  return `${formatAge(now.getTime() - parsed)} ago`;
}

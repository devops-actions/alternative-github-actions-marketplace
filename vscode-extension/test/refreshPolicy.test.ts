import { describe, expect, it } from 'vitest';

import {
  describeAge,
  formatAge,
  FAILURE_BACKOFF_MS,
  MIN_INTERVAL_HOURS,
  shouldRefresh,
  type RefreshState
} from '../src/data/refreshPolicy';

const NOW = new Date('2026-07-26T12:00:00.000Z');

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function state(overrides: Partial<RefreshState> = {}): RefreshState {
  return {
    lastSyncedAt: hoursAgo(1),
    lastAttemptAt: hoursAgo(1),
    lastAttemptFailed: false,
    hasData: true,
    ...overrides
  };
}

const options = { autoRefresh: true, intervalHours: 24, now: NOW };

describe('shouldRefresh', () => {
  it('does nothing when automatic refresh is disabled, even with no data', () => {
    const decision = shouldRefresh(state({ hasData: false }), { ...options, autoRefresh: false });
    expect(decision.shouldRefresh).toBe(false);
    expect(decision.reason).toMatch(/disabled in settings/);
  });

  it('refreshes when nothing is cached', () => {
    expect(shouldRefresh(state({ hasData: false, lastSyncedAt: null, lastAttemptAt: null }), options))
      .toMatchObject({ shouldRefresh: true });
  });

  it('waits while the cached data is younger than the interval', () => {
    const decision = shouldRefresh(state({ lastSyncedAt: hoursAgo(5) }), options);
    expect(decision.shouldRefresh).toBe(false);
    expect(decision.reason).toMatch(/next refresh in 19 hours/);
  });

  it('refreshes once the interval has elapsed', () => {
    expect(shouldRefresh(state({ lastSyncedAt: hoursAgo(24) }), options)).toMatchObject({ shouldRefresh: true });
    expect(shouldRefresh(state({ lastSyncedAt: hoursAgo(30) }), options)).toMatchObject({ shouldRefresh: true });
  });

  it('honours a longer configured interval', () => {
    expect(shouldRefresh(state({ lastSyncedAt: hoursAgo(30) }), { ...options, intervalHours: 168 }))
      .toMatchObject({ shouldRefresh: false });
  });

  it('never refreshes more often than daily, whatever the setting says', () => {
    const decision = shouldRefresh(state({ lastSyncedAt: hoursAgo(2) }), { ...options, intervalHours: 1 });
    expect(decision.shouldRefresh).toBe(false);
    expect(MIN_INTERVAL_HOURS).toBe(24);
  });

  it('backs off after a failure instead of retrying every reload', () => {
    const decision = shouldRefresh(
      state({ hasData: false, lastAttemptFailed: true, lastAttemptAt: new Date(NOW.getTime() - 60_000).toISOString() }),
      options
    );
    expect(decision.shouldRefresh).toBe(false);
    expect(decision.reason).toMatch(/retrying in about 59 minute/);
  });

  it('retries once the backoff window has passed', () => {
    const decision = shouldRefresh(
      state({
        hasData: false,
        lastAttemptFailed: true,
        lastAttemptAt: new Date(NOW.getTime() - FAILURE_BACKOFF_MS - 1000).toISOString()
      }),
      options
    );
    expect(decision.shouldRefresh).toBe(true);
  });

  it('refreshes when the cached data has no recorded sync time', () => {
    expect(shouldRefresh(state({ lastSyncedAt: null }), options)).toMatchObject({ shouldRefresh: true });
  });

  it('treats an unparseable sync time as missing', () => {
    expect(shouldRefresh(state({ lastSyncedAt: 'not a date' }), options)).toMatchObject({ shouldRefresh: true });
  });
});

describe('formatAge', () => {
  it('formats sub-minute, minute, hour, and day scales', () => {
    expect(formatAge(30_000)).toBe('less than a minute');
    expect(formatAge(60_000)).toBe('1 minute');
    expect(formatAge(120_000)).toBe('2 minutes');
    expect(formatAge(3_600_000)).toBe('1 hour');
    expect(formatAge(7_200_000)).toBe('2 hours');
    expect(formatAge(86_400_000)).toBe('1 day');
    expect(formatAge(3 * 86_400_000)).toBe('3 days');
  });

  it('reports unknown for invalid input', () => {
    expect(formatAge(Number.NaN)).toBe('unknown');
    expect(formatAge(-1)).toBe('unknown');
  });
});

describe('describeAge', () => {
  it('appends "ago" to a formatted age', () => {
    expect(describeAge(hoursAgo(3), NOW)).toBe('3 hours ago');
  });

  it('reports "never" when there is no timestamp', () => {
    expect(describeAge(null, NOW)).toBe('never');
    expect(describeAge('nonsense', NOW)).toBe('never');
  });
});

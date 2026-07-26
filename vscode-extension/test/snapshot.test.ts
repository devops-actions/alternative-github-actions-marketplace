import { describe, expect, it } from 'vitest';

import { decodeSnapshot, SnapshotFormatError, SUPPORTED_SCHEMA_VERSION } from '../src/data/snapshot';
import { envelope, row, SHA_CHECKOUT_LATEST } from './helpers';

describe('decodeSnapshot', () => {
  it('decodes rows using the declared field order', () => {
    const decoded = decodeSnapshot(envelope([
      {
        owner: 'actions',
        name: 'checkout',
        latestVersion: 'v7.0.1',
        latestSha: SHA_CHECKOUT_LATEST,
        publishedAt: '2026-07-20T15:10:05Z',
        actionType: 'Node',
        flags: 1 | 4,
        ossfScore: 6.9,
        dependents: 15368157,
        floatingTags: [['v7', SHA_CHECKOUT_LATEST]]
      }
    ]));

    expect(decoded.entries).toHaveLength(1);
    expect(decoded.entries[0]).toEqual({
      owner: 'actions',
      name: 'checkout',
      latestVersion: 'v7.0.1',
      latestSha: SHA_CHECKOUT_LATEST,
      publishedAt: '2026-07-20T15:10:05Z',
      actionType: 'Node',
      verified: true,
      archived: false,
      disabled: false,
      hasOssf: true,
      ossfScore: 6.9,
      dependents: 15368157,
      floatingTags: { v7: SHA_CHECKOUT_LATEST }
    });
  });

  it('respects a reordered field list rather than assuming positions', () => {
    const decoded = decodeSnapshot({
      schemaVersion: 1,
      generatedAt: '2026-07-26T04:30:00.000Z',
      count: 1,
      fields: ['name', 'owner', 'latestSha', 'latestVersion'],
      actions: [['checkout', 'actions', SHA_CHECKOUT_LATEST, 'v7.0.1']]
    });

    expect(decoded.entries[0].owner).toBe('actions');
    expect(decoded.entries[0].name).toBe('checkout');
    expect(decoded.entries[0].latestSha).toBe(SHA_CHECKOUT_LATEST);
  });

  it('decodes each flag bit independently', () => {
    const decoded = decodeSnapshot(envelope([
      { owner: 'o', name: 'verified', flags: 1 },
      { owner: 'o', name: 'archived', flags: 2 },
      { owner: 'o', name: 'ossf', flags: 4 },
      { owner: 'o', name: 'disabled', flags: 8 },
      { owner: 'o', name: 'all', flags: 15 }
    ]));

    expect(decoded.entries.map((entry) => [entry.verified, entry.archived, entry.hasOssf, entry.disabled])).toEqual([
      [true, false, false, false],
      [false, true, false, false],
      [false, false, true, false],
      [false, false, false, true],
      [true, true, true, true]
    ]);
  });

  it('treats missing optional values as null rather than undefined', () => {
    const decoded = decodeSnapshot(envelope([{ owner: 'o', name: 'n' }]));
    const entry = decoded.entries[0];

    expect(entry.latestVersion).toBeNull();
    expect(entry.latestSha).toBeNull();
    expect(entry.publishedAt).toBeNull();
    expect(entry.actionType).toBeNull();
    expect(entry.ossfScore).toBeNull();
    expect(entry.dependents).toBeNull();
    expect(entry.floatingTags).toEqual({});
  });

  it('skips rows without an owner or name instead of producing broken entries', () => {
    const decoded = decodeSnapshot(envelope([], {
      actions: [
        row({ owner: 'actions', name: 'checkout' }),
        [null, 'orphan', null, null],
        ['owner-only'],
        'not a row' as unknown as unknown[]
      ]
    }));

    expect(decoded.entries.map((entry) => entry.name)).toEqual(['checkout']);
  });

  it('ignores malformed floating tag pairs', () => {
    const decoded = decodeSnapshot(envelope([], {
      actions: [[
        'o', 'n', 'v1', null, null, null, 0, null, null,
        [['v1', SHA_CHECKOUT_LATEST], ['no-sha'], 'nope', [null, 'x']]
      ]]
    }));

    expect(decoded.entries[0].floatingTags).toEqual({ v1: SHA_CHECKOUT_LATEST });
  });

  it('falls back to the row count when the envelope count is missing', () => {
    const decoded = decodeSnapshot(envelope([{ owner: 'o', name: 'n' }], { count: undefined }));
    expect(decoded.count).toBe(1);
  });

  it('rejects a payload that is not an object', () => {
    expect(() => decodeSnapshot(null)).toThrow(SnapshotFormatError);
    expect(() => decodeSnapshot([])).toThrow(SnapshotFormatError);
    expect(() => decodeSnapshot('nope')).toThrow(SnapshotFormatError);
  });

  it('rejects a payload missing fields or actions', () => {
    expect(() => decodeSnapshot({ schemaVersion: 1, actions: [] })).toThrow(/missing the "fields"/);
    expect(() => decodeSnapshot({ schemaVersion: 1, fields: [] })).toThrow(/missing the "fields"/);
  });

  it('rejects a payload without a numeric schema version', () => {
    expect(() => decodeSnapshot({ fields: [], actions: [] })).toThrow(/schemaVersion/);
  });

  it('rejects a schema version newer than this extension understands', () => {
    expect(() => decodeSnapshot(envelope([], { schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 })))
      .toThrow(/newer than this extension supports/);
  });

  it('rejects a payload that omits a required field', () => {
    expect(() => decodeSnapshot({
      schemaVersion: 1,
      fields: ['owner', 'name', 'latestVersion'],
      actions: []
    })).toThrow(/required field "latestSha"/);
  });
});

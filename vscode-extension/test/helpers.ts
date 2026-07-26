import { ActionIndex } from '../src/data/actionIndex';
import { decodeSnapshot, type SnapshotEnvelope } from '../src/data/snapshot';

export const SNAPSHOT_FIELDS = [
  'owner',
  'name',
  'latestVersion',
  'latestSha',
  'publishedAt',
  'actionType',
  'flags',
  'ossfScore',
  'dependents',
  'floatingTags'
];

export interface RowInput {
  owner: string;
  name: string;
  latestVersion?: string | null;
  latestSha?: string | null;
  publishedAt?: string | null;
  actionType?: string | null;
  flags?: number;
  ossfScore?: number | null;
  dependents?: number | null;
  floatingTags?: Array<[string, string]> | 0;
}

export function row(input: RowInput): unknown[] {
  return [
    input.owner,
    input.name,
    input.latestVersion ?? null,
    input.latestSha ?? null,
    input.publishedAt ?? null,
    input.actionType ?? null,
    input.flags ?? 0,
    input.ossfScore ?? null,
    input.dependents ?? null,
    input.floatingTags ?? 0
  ];
}

export function envelope(rows: RowInput[], overrides: Partial<SnapshotEnvelope> = {}): SnapshotEnvelope {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-26T04:30:00.000Z',
    count: rows.length,
    fields: SNAPSHOT_FIELDS,
    actions: rows.map(row),
    ...overrides
  };
}

export function indexOf(rows: RowInput[]): ActionIndex {
  return new ActionIndex(decodeSnapshot(envelope(rows)));
}

export const SHA_CHECKOUT_LATEST = '3d3c42e5aac5ba805825da76410c181273ba90b1';
export const SHA_CHECKOUT_V6 = 'd23441a48e516b6c34aea4fa41551a30e30af803';

/** A small, realistic dataset used across the suites. */
export const SAMPLE_ROWS: RowInput[] = [
  {
    owner: 'actions',
    name: 'checkout',
    latestVersion: 'v7.0.1',
    latestSha: SHA_CHECKOUT_LATEST,
    publishedAt: '2026-07-20T15:10:05Z',
    actionType: 'Node',
    flags: 4,
    ossfScore: 6.9,
    dependents: 15368157,
    floatingTags: [['v7', SHA_CHECKOUT_LATEST], ['v6', SHA_CHECKOUT_V6]]
  },
  {
    owner: 'actions',
    name: 'setup-node',
    latestVersion: 'v5.0.0',
    latestSha: null,
    publishedAt: '2026-05-01T10:00:00Z',
    actionType: 'Node',
    flags: 1,
    ossfScore: 7.5,
    dependents: 5000000
  },
  {
    owner: 'github',
    name: 'codeql-action_analyze',
    latestVersion: 'v3.28.0',
    latestSha: 'a'.repeat(40),
    publishedAt: '2026-06-15T08:00:00Z',
    actionType: 'Node',
    flags: 0,
    dependents: 200000,
    floatingTags: [['v3', 'a'.repeat(40)]]
  },
  {
    owner: 'someone',
    name: 'abandoned-action',
    latestVersion: 'v1.0.0',
    latestSha: 'b'.repeat(40),
    publishedAt: '2019-01-01T00:00:00Z',
    actionType: 'Docker',
    flags: 2,
    dependents: 3
  },
  {
    owner: 'someone',
    name: 'no-releases',
    latestVersion: null,
    latestSha: null,
    actionType: 'Composite',
    flags: 0,
    dependents: 0
  }
];

export interface Action {
  owner: string;
  name: string;
  dependabot: {
    alerts: number;
    open: number;
  } | null;
  vulnerabilityStatus: {
    lastUpdated: string;
    critical: number;
    high: number;
  };
  forkFound: boolean;
  actionType: {
    actionType: 'Node' | 'Docker' | 'Composite';
    fileFound: string;
    actionDockerType: string;
    nodeVersion: string | null;
  };
  repoInfo: {
    latest_release_published_at: string;
    disabled: boolean;
    updated_at: string;
    archived: boolean;
  };
  tagInfo: string[];
  releaseInfo: string[];
  versionShaMap?: Record<string, string>;
  dependabotEnabled: boolean;
  mirrorLastUpdated: string | null;
  secretScanningEnabled: boolean;
  repoSize: number | null;
  ossfDateLastUpdate: string;
  dependents: {
    dependentsLastUpdated: string;
    dependents: string;
  };
  verified: boolean;
  ossf: boolean;
  ossfScore: number;
  _metadata?: {
    partitionKey: string;
    rowKey: string;
    payloadHash: string;
    etag?: string;
    lastSyncedUtc?: string;
  };
}

export type ActionTypeFilter = 'All' | 'Node' | 'Docker' | 'Composite' | 'Unknown' | 'No file found';

export interface DbStatusAgeDistribution {
  within1day: number;
  within7days: number;
  within30days: number;
  olderThan30days: number;
  noTimestamp: number;
}

/**
 * Freshness data from the /api/actions/status endpoint.
 *
 * Note: `newestSyncedUtc` reflects the last time any action's *data changed*
 * in the database — not the last time the pipeline checked it. Actions whose
 * data hasn't changed since a previous run will have an older timestamp.
 */
export interface DbStatus {
  totalCount: number;
  newestSyncedUtc: string | null;
  oldestSyncedUtc: string | null;
  ageDistribution: DbStatusAgeDistribution;
  generatedAt: string;
}

export interface ActionStats {
  total: number;
  byType: Record<string, number>;
  verified: number;
  archived: number;
  withOssf: number;
}

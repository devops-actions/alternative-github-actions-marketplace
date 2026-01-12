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

export interface ActionStats {
  total: number;
  byType: Record<string, number>;
  verified: number;
}

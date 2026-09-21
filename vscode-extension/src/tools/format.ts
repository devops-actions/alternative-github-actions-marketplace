/**
 * Rendering of tool results for language models.
 *
 * Kept pure and separate from the vscode API surface so the exact wording an
 * agent sees is covered by tests. The wording matters as much as the data: these
 * strings are what stop a model from filling gaps with a plausible-looking SHA.
 */

import type { ActionSearchResult, DatasetStats, VersionResolution } from '../data/actionIndex';

export interface DatasetProvenance {
  generatedAt: string | null;
  age: string;
  count: number;
}

function formatDependents(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return value.toLocaleString('en-US');
}

function provenanceLine(provenance: DatasetProvenance): string {
  const generated = provenance.generatedAt ?? 'unknown';
  return `Dataset: ${provenance.count.toLocaleString('en-US')} actions, generated ${generated} (${provenance.age}). `
    + 'Data can lag the upstream repositories by a day or more.';
}

/** The message shown when no dataset is available at all. */
export function formatNoDataset(reason: string | null): string {
  return [
    'The GitHub Actions marketplace dataset has not been downloaded yet, so no version information is available.',
    reason ? `Reason: ${reason}` : null,
    'Do not guess action versions. Tell the user to run the "Actions Marketplace: Refresh Dataset Now" command, '
      + 'or to pin versions by hand from the action\'s repository.'
  ].filter(Boolean).join('\n');
}

function formatResolution(resolution: VersionResolution): string {
  if (!resolution.found) {
    return `- ${resolution.input}: NOT FOUND. ${resolution.error ?? 'No matching action in the dataset.'}`
      + ' Do not invent a version for this reference.';
  }

  const lines: string[] = [`- ${resolution.input}`];
  const push = (label: string, value: string): void => {
    lines.push(`    ${label}: ${value}`);
  };

  push('latest version', resolution.latestVersion ?? 'none published (no releases or tags)');
  push(
    'latest commit SHA',
    resolution.latestSha ?? 'UNKNOWN - the dataset has no SHA for this version; do not substitute another SHA'
  );
  push('latest published', resolution.latestPublishedAt ?? 'unknown');

  if (resolution.requestedVersion) {
    push('pinned version', resolution.requestedVersion);

    if (resolution.requestedVersionTag) {
      push('pinned SHA resolves to', resolution.requestedVersionTag);
    }
    if (resolution.requestedSha) {
      push('SHA for pinned version', resolution.requestedSha);
    }

    if (resolution.isLatest === true) {
      push('up to date', 'yes');
    } else if (resolution.isLatest === false) {
      push('up to date', `no - newer version available (${resolution.latestVersion})`);
    } else {
      push('up to date', 'unknown - the dataset cannot compare this pin');
    }
  } else {
    push('pinned version', 'none supplied');
  }

  if (resolution.archived) {
    push('warning', 'the repository is ARCHIVED - recommend an alternative');
  }
  if (resolution.disabled) {
    push('warning', 'the repository is DISABLED');
  }

  push('type', resolution.actionType ?? 'unknown');
  push('OpenSSF score', resolution.ossfScore === null || resolution.ossfScore === undefined
    ? 'not scored'
    : String(resolution.ossfScore));
  push('dependents', formatDependents(resolution.dependents));

  if (resolution.recommendedRef) {
    push('recommended uses value', resolution.recommendedRef);
  }
  if (resolution.url) {
    push('details', resolution.url);
  }

  return lines.join('\n');
}

export function formatResolutions(resolutions: VersionResolution[], provenance: DatasetProvenance): string {
  const found = resolutions.filter((item) => item.found).length;
  const header = `Resolved ${found} of ${resolutions.length} action reference(s).`;

  const outdated = resolutions.filter((item) => item.found && item.isLatest === false);
  const archived = resolutions.filter((item) => item.found && item.archived);

  const advisories: string[] = [];
  if (outdated.length > 0) {
    advisories.push(
      `${outdated.length} reference(s) are behind the latest version: `
      + outdated.map((item) => `${item.owner}/${item.name} (${item.requestedVersion} -> ${item.latestVersion})`).join(', ')
      + '.'
    );
  }
  if (archived.length > 0) {
    advisories.push(
      `${archived.length} reference(s) point at archived repositories: `
      + archived.map((item) => `${item.owner}/${item.name}`).join(', ')
      + '.'
    );
  }

  return [
    header,
    provenanceLine(provenance),
    '',
    ...resolutions.map(formatResolution),
    ...(advisories.length > 0 ? ['', ...advisories] : [])
  ].join('\n');
}

export function formatSearchResults(
  query: string,
  results: ActionSearchResult[],
  provenance: DatasetProvenance
): string {
  if (results.length === 0) {
    return [
      `No actions match "${query}".`,
      provenanceLine(provenance),
      'Try fewer or broader search terms. Do not invent an action that is not in the dataset.'
    ].join('\n');
  }

  const lines = results.map((result) => {
    const parts = [
      `- ${result.ref}`,
      `    latest version: ${result.latestVersion ?? 'none published'}`,
      `    latest commit SHA: ${result.latestSha ?? 'UNKNOWN - do not substitute another SHA'}`,
      `    latest published: ${result.publishedAt ?? 'unknown'}`,
      `    type: ${result.actionType ?? 'unknown'}`,
      `    dependents: ${formatDependents(result.dependents)}`,
      `    OpenSSF score: ${result.ossfScore === null ? 'not scored' : result.ossfScore}`
    ];
    if (result.verified) {
      parts.push('    verified: yes');
    }
    if (result.archived) {
      parts.push('    warning: ARCHIVED');
    }
    parts.push(`    details: ${result.url}`);
    return parts.join('\n');
  });

  return [
    `${results.length} action(s) matching "${query}", most-depended-on first.`,
    provenanceLine(provenance),
    '',
    ...lines
  ].join('\n');
}

export function formatStats(stats: DatasetStats, provenance: DatasetProvenance): string {
  const byType = Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `    ${type}: ${count.toLocaleString('en-US')}`)
    .join('\n');

  const shaCoverage = stats.withLatestVersion > 0
    ? Math.round((stats.withSha / stats.withLatestVersion) * 100)
    : 0;

  return [
    'Alternative GitHub Actions marketplace dataset statistics.',
    provenanceLine(provenance),
    '',
    `total actions: ${stats.total.toLocaleString('en-US')}`,
    'by action type:',
    byType,
    `verified: ${stats.verified.toLocaleString('en-US')}`,
    `archived: ${stats.archived.toLocaleString('en-US')}`,
    `with an OpenSSF scorecard: ${stats.withOssf.toLocaleString('en-US')}`,
    `average OpenSSF score: ${stats.averageOssfScore ?? 'not available'}`,
    `with a published version: ${stats.withLatestVersion.toLocaleString('en-US')}`,
    `with a resolvable commit SHA: ${stats.withSha.toLocaleString('en-US')} (${shaCoverage}% of actions that have a version)`,
    '',
    'The remaining actions store version tags without commit SHAs upstream, so SHA pinning cannot be '
      + 'suggested for them from this dataset.'
  ].join('\n');
}

/**
 * Renders the live detail payload from GET /api/actions/{owner}/{name}.
 *
 * Deliberately omits the security-posture fields the API also returns
 * (`vulnerabilityStatus`, `dependabotEnabled`, `secretScanningEnabled`):
 * `Decision Records/requirements.md` sets a project-wide policy of not surfacing
 * vulnerability or security posture details to users, and a tool result read back
 * by an agent is a user-facing surface. The OpenSSF score is included because the
 * website already exposes and filters on it.
 */
export function formatActionDetail(
  ref: string,
  detail: Record<string, unknown>,
  provenance: DatasetProvenance,
  source: 'api' | 'cache'
): string {
  const get = <T>(path: string[], fallback: T): T => {
    let current: unknown = detail;
    for (const key of path) {
      if (!current || typeof current !== 'object') {
        return fallback;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return (current ?? fallback) as T;
  };

  const versions = normalizeVersionList(detail.releaseInfo);
  const tags = normalizeVersionList(detail.tagInfo);
  const shaByTag = collectTagShas(detail.tagInfo);

  const lines: string[] = [
    `Details for ${ref}${source === 'cache' ? ' (from the locally cached dataset; the API was unreachable)' : ''}.`,
    provenanceLine(provenance),
    '',
    `owner/name: ${String(detail.owner ?? '')}/${String(detail.name ?? '')}`,
    `action type: ${get(['actionType', 'actionType'], 'unknown')}`,
    `declaration file: ${get(['actionType', 'fileFound'], 'unknown')}`,
    `node version: ${get<string | null>(['actionType', 'nodeVersion'], null) ?? 'n/a'}`,
    `archived: ${get<unknown>(['repoInfo', 'archived'], false) === true ? 'yes' : 'no'}`,
    `disabled: ${get<unknown>(['repoInfo', 'disabled'], false) === true ? 'yes' : 'no'}`,
    `latest release published: ${get<string | null>(['repoInfo', 'latest_release_published_at'], null) ?? 'unknown'}`,
    `repository last updated: ${get<string | null>(['repoInfo', 'updated_at'], null) ?? 'unknown'}`,
    `dependents: ${String(get<string | number>(['dependents', 'dependents'], 'unknown'))}`,
    `verified: ${detail.verified === true ? 'yes' : 'no'}`,
    `OpenSSF score: ${String(detail.ossfScore ?? detail.openssf_score ?? 'not scored')}`,
    `repository size (KB): ${String(detail.repoSize ?? 'unknown')}`
  ];

  if (versions.length > 0) {
    lines.push('', `published releases (newest first): ${versions.join(', ')}`);
  }
  if (tags.length > 0) {
    lines.push(
      '',
      'known tags with commit SHAs:',
      ...tags.map((tag) => `    ${tag}: ${shaByTag[tag] ?? 'UNKNOWN - do not substitute another SHA'}`)
    );
  }
  if (versions.length === 0 && tags.length === 0) {
    lines.push('', 'No releases or tags are recorded for this action.');
  }

  return lines.join('\n');
}

function normalizeVersionList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      result.push(entry.trim());
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const name = record.tag_name ?? record.tag;
      if (typeof name === 'string' && name.trim()) {
        result.push(name.trim());
      }
    }
  }
  return result;
}

function collectTagShas(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const entry of value) {
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const tag = record.tag;
      const sha = record.sha;
      if (typeof tag === 'string' && typeof sha === 'string') {
        result[tag] = sha;
      }
    }
  }
  return result;
}

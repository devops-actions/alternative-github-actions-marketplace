/**
 * In-memory index over a decoded snapshot: lookup, version resolution, search,
 * and aggregate stats.
 *
 * Pure by design - no vscode imports - so the behaviour that agents depend on
 * can be tested directly.
 */

import type { ActionEntry, DecodedSnapshot } from './snapshot';
import { formatPinnedRef, isShaLike, isRefError, parseActionRef, type ActionRefResult } from './actionRef';

export interface ActionSearchResult extends ActionEntry {
  /** `owner/name` as a display string. */
  ref: string;
  url: string;
}

export interface SearchFilters {
  actionType?: string;
  owner?: string;
  verifiedOnly?: boolean;
  includeArchived?: boolean;
  limit?: number;
}

export interface DatasetStats {
  total: number;
  byType: Record<string, number>;
  verified: number;
  archived: number;
  withOssf: number;
  withLatestVersion: number;
  withSha: number;
  averageOssfScore: number | null;
}

export interface VersionResolution {
  /** The reference as supplied by the caller. */
  input: string;
  found: boolean;
  error?: string;
  owner?: string;
  name?: string;
  subPath?: string | null;
  latestVersion?: string | null;
  latestSha?: string | null;
  latestPublishedAt?: string | null;
  /** The version the caller pinned, if any. */
  requestedVersion?: string | null;
  /** SHA the pinned version resolves to, when known. */
  requestedSha?: string | null;
  /** When the caller pinned a SHA, the tag that SHA corresponds to, if we can name it. */
  requestedVersionTag?: string | null;
  /**
   * True when the pin is already current, false when it is not, null when the
   * dataset cannot tell - never guessed.
   */
  isLatest?: boolean | null;
  archived?: boolean;
  disabled?: boolean;
  verified?: boolean;
  actionType?: string | null;
  ossfScore?: number | null;
  dependents?: number | null;
  /** Suggested `uses:` value, SHA-pinned when a SHA is known. */
  recommendedRef?: string;
  url?: string;
}

const DEFAULT_SEARCH_LIMIT = 15;
const MAX_SEARCH_LIMIT = 50;

/** Matches a floating tag such as `v4` or `4`. */
const MAJOR_ONLY_PATTERN = /^v?(\d+)$/i;

/**
 * Normalizes text for search the same way the website does, so a query typed in
 * the extension returns the same matches as the same query on the site.
 */
function normalizeSearchable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function tokenizeQuery(query: string): string[] {
  return normalizeSearchable(query).split(/\s+/).filter(Boolean);
}

/**
 * Builds the text a query is matched against for one entry: owner, name, type,
 * verified/archived state, and description - everything a user might type to
 * find an action by what it does rather than just what it's called.
 */
function buildSearchableText(entry: ActionEntry): string {
  const parts = [entry.owner, entry.name, entry.actionType, entry.description];
  if (entry.verified) {
    parts.push('verified');
  }
  if (entry.archived) {
    parts.push('archived');
  }
  return normalizeSearchable(parts.filter(Boolean).join(' '));
}

function actionUrl(owner: string, name: string): string {
  return `https://marketplace.devopsjournal.io/action/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

interface IndexedEntry {
  entry: ActionEntry;
  searchable: string;
}

export class ActionIndex {
  readonly generatedAt: string;
  readonly schemaVersion: number;

  private readonly indexed: IndexedEntry[];
  private readonly byKey = new Map<string, ActionEntry>();
  private readonly aliases = new Map<string, ActionEntry>();
  private cachedStats: DatasetStats | null = null;

  constructor(snapshot: DecodedSnapshot) {
    this.generatedAt = snapshot.generatedAt;
    this.schemaVersion = snapshot.schemaVersion;
    this.indexed = snapshot.entries.map((entry) => ({
      entry,
      searchable: buildSearchableText(entry)
    }));

    for (const { entry } of this.indexed) {
      const key = `${entry.owner.toLowerCase()}/${entry.name.toLowerCase()}`;
      if (!this.byKey.has(key)) {
        this.byKey.set(key, entry);
      }

      // Composite action names arrive with their sub-path underscore-encoded
      // ("codeql-action_analyze"), but workflows write them with slashes
      // ("github/codeql-action/analyze"). Register the slash form as an alias so
      // both spellings resolve. Aliases never shadow a real key.
      if (entry.name.includes('_')) {
        const alias = `${entry.owner.toLowerCase()}/${entry.name.toLowerCase().replace(/_/g, '/')}`;
        if (!this.aliases.has(alias)) {
          this.aliases.set(alias, entry);
        }
      }
    }
  }

  get size(): number {
    return this.indexed.length;
  }

  /** Looks up an action by owner and name, tolerating composite sub-paths. */
  get(owner: string, name: string, subPath?: string | null): ActionEntry | undefined {
    const base = `${owner.toLowerCase()}/${name.toLowerCase()}`;

    if (subPath) {
      const withPath = `${base}/${subPath.toLowerCase()}`;
      const aliasHit = this.aliases.get(withPath) ?? this.byKey.get(withPath);
      if (aliasHit) {
        return aliasHit;
      }
      // A sub-path action inherits the repository's tags and releases, so the
      // repository entry is the right answer when the sub-path is not indexed
      // separately.
    }

    return this.byKey.get(base) ?? this.aliases.get(base);
  }

  /**
   * Resolves one action reference against the dataset.
   *
   * Every "unknown" stays null rather than being inferred: an agent that pins a
   * SHA we invented is worse than one that is told the SHA is unavailable.
   */
  resolve(input: unknown): VersionResolution {
    const parsed: ActionRefResult = parseActionRef(input);

    if (isRefError(parsed)) {
      return { input: parsed.raw, found: false, error: parsed.error };
    }

    const entry = this.get(parsed.owner, parsed.name, parsed.subPath);

    if (!entry) {
      return {
        input: parsed.raw,
        found: false,
        owner: parsed.owner,
        name: parsed.name,
        subPath: parsed.subPath,
        requestedVersion: parsed.version,
        error: `"${parsed.owner}/${parsed.name}" is not in the marketplace dataset.`
      };
    }

    const requested = parsed.version;
    const requestedVersionTag = parsed.isSha && requested ? this.tagForSha(entry, requested) : null;
    const requestedSha = this.shaForVersion(entry, requested);
    const isLatest = this.isLatest(entry, parsed);

    const recommendedRef = formatPinnedRef(
      entry.owner,
      // Report the sub-path spelling the caller used, so a suggestion can be
      // pasted straight back into the workflow.
      parsed.subPath ? parsed.name : entry.name,
      parsed.subPath,
      entry.latestSha ?? '',
      entry.latestVersion
    );

    return {
      input: parsed.raw,
      found: true,
      owner: entry.owner,
      name: entry.name,
      subPath: parsed.subPath,
      latestVersion: entry.latestVersion,
      latestSha: entry.latestSha,
      latestPublishedAt: entry.publishedAt,
      requestedVersion: requested,
      requestedSha,
      requestedVersionTag,
      isLatest,
      archived: entry.archived,
      disabled: entry.disabled,
      verified: entry.verified,
      actionType: entry.actionType,
      ossfScore: entry.ossfScore,
      dependents: entry.dependents,
      recommendedRef: entry.latestSha
        ? recommendedRef
        : entry.latestVersion
          ? `${parsed.subPath ? `${entry.owner}/${entry.name}/${parsed.subPath}` : `${entry.owner}/${entry.name}`}@${entry.latestVersion}`
          : undefined,
      url: actionUrl(entry.owner, entry.name)
    };
  }

  /** Resolves a batch of references, preserving input order. */
  resolveMany(inputs: unknown[]): VersionResolution[] {
    return inputs.map((input) => this.resolve(input));
  }

  /** Finds the tag a SHA corresponds to, or null when the dataset cannot say. */
  private tagForSha(entry: ActionEntry, sha: string): string | null {
    const target = sha.toLowerCase();

    // Short SHAs are common in workflows; match on prefix so a 7-character pin
    // still resolves against the stored 40-character SHA.
    const matches = (candidate: string): boolean =>
      candidate.toLowerCase() === target || candidate.toLowerCase().startsWith(target);

    if (entry.latestSha && matches(entry.latestSha) && entry.latestVersion) {
      return entry.latestVersion;
    }

    for (const [tag, tagSha] of Object.entries(entry.floatingTags)) {
      if (matches(tagSha)) {
        return tag;
      }
    }

    return null;
  }

  /** Finds the SHA for a specific version, or null when it is not known. */
  private shaForVersion(entry: ActionEntry, version: string | null): string | null {
    if (!version) {
      return null;
    }
    if (isShaLike(version) && !entry.floatingTags[version]) {
      // The caller already gave us a SHA; echoing it back as "resolved" would
      // imply the dataset confirmed it, which it did not.
      return null;
    }
    if (entry.latestVersion && version === entry.latestVersion) {
      return entry.latestSha;
    }
    return entry.floatingTags[version] ?? null;
  }

  /**
   * Decides whether a pin is current.
   *
   * Returns null whenever the dataset genuinely cannot tell: an unknown SHA, or
   * an action with no version data at all.
   */
  private isLatest(entry: ActionEntry, parsed: { version: string | null; isSha: boolean }): boolean | null {
    if (!parsed.version) {
      return null;
    }
    if (!entry.latestVersion) {
      return null;
    }

    if (parsed.isSha) {
      const tag = this.tagForSha(entry, parsed.version);
      if (!tag) {
        return null;
      }
      if (entry.latestSha && (entry.latestSha.toLowerCase() === parsed.version.toLowerCase()
        || entry.latestSha.toLowerCase().startsWith(parsed.version.toLowerCase()))) {
        return true;
      }
      return this.compareTagToLatest(tag, entry.latestVersion);
    }

    return this.compareTagToLatest(parsed.version, entry.latestVersion);
  }

  /**
   * Compares a tag against the latest version.
   *
   * A major-only pin such as `v4` is treated as current when the latest version
   * is inside that major, because `v4` is a floating tag that GitHub moves
   * forward - the workflow is already getting `v4.x`.
   */
  private compareTagToLatest(tag: string, latestVersion: string): boolean {
    const normalizedTag = tag.toLowerCase();
    const normalizedLatest = latestVersion.toLowerCase();

    if (normalizedTag === normalizedLatest) {
      return true;
    }

    const majorMatch = normalizedTag.match(MAJOR_ONLY_PATTERN);
    if (majorMatch) {
      const major = majorMatch[1];
      return normalizedLatest === `v${major}`
        || normalizedLatest === major
        || normalizedLatest.startsWith(`v${major}.`)
        || normalizedLatest.startsWith(`${major}.`);
    }

    return false;
  }

  /**
   * Token search over owner, name, type, verified/archived state, and
   * description, matching the website's behaviour: every token in the query
   * must appear somewhere in the normalized text.
   */
  search(query: string, filters: SearchFilters = {}): ActionSearchResult[] {
    const tokens = tokenizeQuery(query);
    const ownerFilter = filters.owner ? filters.owner.toLowerCase().trim() : null;
    const typeFilter = filters.actionType ? filters.actionType.toLowerCase().trim() : null;
    const includeArchived = filters.includeArchived === true;
    const limit = Math.min(
      Math.max(1, Math.floor(filters.limit ?? DEFAULT_SEARCH_LIMIT)),
      MAX_SEARCH_LIMIT
    );

    const matches: ActionEntry[] = [];

    for (const { entry, searchable } of this.indexed) {
      if (tokens.length > 0 && !tokens.every((token) => searchable.includes(token))) {
        continue;
      }
      if (ownerFilter && entry.owner.toLowerCase() !== ownerFilter) {
        continue;
      }
      if (typeFilter && (entry.actionType ?? '').toLowerCase() !== typeFilter) {
        continue;
      }
      if (filters.verifiedOnly && !entry.verified) {
        continue;
      }
      if (!includeArchived && entry.archived) {
        continue;
      }
      matches.push(entry);
    }

    // Dependent count is the closest thing the dataset has to a relevance
    // signal, and it is what the website sorts by out of the box.
    matches.sort((a, b) => {
      const dependentsDelta = (b.dependents ?? 0) - (a.dependents ?? 0);
      if (dependentsDelta !== 0) {
        return dependentsDelta;
      }
      return `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`);
    });

    return matches.slice(0, limit).map((entry) => ({
      ...entry,
      ref: `${entry.owner}/${entry.name}`,
      url: actionUrl(entry.owner, entry.name)
    }));
  }

  /** Aggregates the dataset. Computed once and memoized. */
  stats(): DatasetStats {
    if (this.cachedStats) {
      return this.cachedStats;
    }

    const byType: Record<string, number> = {};
    let verified = 0;
    let archived = 0;
    let withOssf = 0;
    let withLatestVersion = 0;
    let withSha = 0;
    let ossfScoreSum = 0;
    let ossfScoreCount = 0;

    for (const { entry } of this.indexed) {
      const type = entry.actionType ?? 'Unknown';
      byType[type] = (byType[type] ?? 0) + 1;

      if (entry.verified) {
        verified += 1;
      }
      if (entry.archived) {
        archived += 1;
      }
      if (entry.hasOssf) {
        withOssf += 1;
      }
      if (entry.latestVersion) {
        withLatestVersion += 1;
      }
      if (entry.latestSha) {
        withSha += 1;
      }
      if (entry.ossfScore !== null) {
        ossfScoreSum += entry.ossfScore;
        ossfScoreCount += 1;
      }
    }

    this.cachedStats = {
      total: this.indexed.length,
      byType,
      verified,
      archived,
      withOssf,
      withLatestVersion,
      withSha,
      averageOssfScore: ossfScoreCount > 0
        ? Math.round((ossfScoreSum / ossfScoreCount) * 10) / 10
        : null
    };

    return this.cachedStats;
  }
}

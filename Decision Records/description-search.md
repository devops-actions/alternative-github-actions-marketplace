# Keyword Search Beyond Owner/Name

## Context

Search in both the VS Code extension's Marketplace Explorer and the website's
overview page matched only `owner` and `name`. A query like "docker" or "lint"
found nothing unless that word happened to appear in a repo or action name,
even though most actions describe what they do in their `action.yml`
`description` field. `description` is a documented top-level field in the raw
payload schema ([src/backend/README.md](../src/backend/README.md#action-data-schema)) and
round-trips through `ActionRecord` today, but nothing in this repo populates
it - the crawler that reads `action.yml` from GitHub repos and uploads
records is an external pipeline, out of this repo.

## Decision

Two independent changes:

### 1. Fold already-available facets into free-text search

`actionType`, `verified`, and `archived` were already carried by both wire
formats ([lib/versionsBuilder.js](../src/backend/lib/versionsBuilder.js) for the extension,
[lib/actionSummary.js](../src/backend/lib/actionSummary.js) for the website) but were filter-only,
never part of the searchable text. Both `ActionIndex.search`
(`vscode-extension/src/data/actionIndex.ts`) and the website's
`matchesSearchQuery` (`src/frontend/src/services/utils.ts`) now fold owner,
name, action type, and the literal tokens `verified`/`archived` (when set)
into one normalized string, and match every query token against it. This
needed no backend change and no schema version bump.

### 2. Add `description` to both projections

`description` is appended to `VERSIONS_FIELDS` in `versionsBuilder.js` and to
the summary shape in `actionSummary.js`, trimmed and capped at 200 characters
(`DESCRIPTION_MAX_LENGTH` in both files) - a one-line blurb is enough for
search and display, and mirrors the "no full version history" scoping
decision in [action-versions-feed.md](action-versions-feed.md). This is a pure append to
the positional `versions` feed, so per that feed's own convention it does not
require a `VERSIONS_SCHEMA_VERSION` bump.

Both extractors read `payload.description` directly and report `null` when
absent or blank - **null means "unknown," not "no description,"** the same
convention `latestSha` already uses for the ~half of the dataset with no
resolvable commit SHA. Search and the UI must not distinguish "empty" from
"not sent yet."

Consumers:
- The extension's `snapshot.ts` decodes `description` as an optional field
  (not in `REQUIRED_FIELDS`, so an older server response without it still
  decodes cleanly) and `actionIndex.ts` folds it into the searchable text
  alongside owner/name/type.
- The website's `Action` type gained an optional `description`, folded into
  `matchesSearchQuery` the same way.

### Population responsibility

Populating `description` is out of scope for this repo. The external crawler
that uploads action records needs to parse `description` out of each
repository's `action.yml` and include it in the upsert payload - the same
"external indexer populates it" split used for `versionShaMap`
([version-sha-map.md](version-sha-map.md)). Until that lands, every row's `description`
is `null` and search behaves exactly as it did before this change, degrading
gracefully rather than erroring.

## Rejected alternative

Bumping `VERSIONS_SCHEMA_VERSION` for the new field. Unnecessary: per the
feed's own convention (see `versionsBuilder.js`), appending a field at the end
of the positional row is backwards compatible - only reordering or removing a
field requires a version bump.

## Status

Accepted

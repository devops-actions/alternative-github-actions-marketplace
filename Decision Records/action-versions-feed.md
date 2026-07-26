# Action Versions Feed for Offline Clients

## Context

The VS Code extension needs the latest version, publish date, and commit SHA of
every action, available locally: it answers AI agent tool calls, where a network
round trip per action would be too slow and an offline failure would push the
model back to guessing versions from memory.

No existing read path fits:

- `GET /actions/{owner}/{name}` is one request per action.
- `GET /actions/list` returns the full records - roughly 26 MB over ~35k actions -
  which is far too much to transfer on a recurring refresh.
- `GET /actions/snapshot` (the overview snapshot, see below) is close in spirit
  but its projection in `lib/actionSummary.js` deliberately drops `tagInfo` and
  `versionShaMap`, so it carries no commit SHAs at all.

## Decision

Add `GET /api/actions/versions`: one compact projection of the whole dataset,
rebuilt daily server-side, downloaded by clients at most once a day.

### Why a second feed rather than extending the overview snapshot

The overview snapshot exists to make the website's first paint fast, and its
projection is explicitly scoped to "fields the overview and state pages read".
Adding SHA data would grow a payload on the page-load hot path by roughly 25% to
carry data the website never renders.

Rejected alternatives:

- **Extend `lib/actionSummary.js`.** One endpoint, one blob, one scan, but it
  pushes SHA data into every overview page load and contradicts that file's
  stated scope.
- **One scan emitting both projections.** Avoids the duplicate table scan, but
  couples the release cycles of the website's fast path and an editor
  integration. Worth revisiting if the two scans become a measurable cost - the
  builders are independent modules, so the timers can be merged later without
  changing either wire format.

The two feeds share the `snapshots` blob container and differ only in blob name,
so this costs one extra blob and one extra daily timer.

### Shape: positional rows with a self-describing field list

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-26T04:30:00.000Z",
  "count": 35314,
  "fields": ["owner", "name", "latestVersion", "latestSha", "publishedAt",
             "actionType", "flags", "ossfScore", "dependents", "floatingTags"],
  "flags": { "verified": 1, "archived": 2, "ossf": 4, "disabled": 8 },
  "actions": [["actions", "checkout", "v7.0.1", "3d3c42e5...", "2026-07-20T15:10:05Z",
               "Node", 4, 6.9, 15368157, [["v7", "3d3c42e5..."]]]]
}
```

Measured over a 3,000-record sample of production data, the full set projects to
**~4.7 MB of JSON, ~1.6 MB gzipped**.

- Rows are arrays, not objects: repeating ten property names 35k times costs more
  than the values.
- `fields` names the positions, so clients validate the layout instead of trusting
  hard-coded indexes. Fields are append-only; reordering or removing one bumps
  `schemaVersion`.
- Boolean facets are packed into one `flags` integer.
- `floatingTags` carries `[tag, sha]` pairs for floating major/minor tags (`v4`,
  `v4.1`) - the ones people actually pin - and only when a SHA is known. Immutable
  patch tags are already covered by `latestVersion`, and including every tag would
  inflate the payload for little gain.
- Full version history is deliberately excluded. Clients that need it call
  `GET /actions/{owner}/{name}`.

### Freshness: full feed with a content-derived ETag

Rejected alternative: a day-over-day delta endpoint (`?since=YYYY-MM-DD`). It
would need dated feed retention, diffing, and a full-resync fallback when a
client is too far behind - meaningful complexity to save ~1.6 MB a day.

Instead:

- `ETag` is `sha256` of the uncompressed feed JSON, stored in blob metadata.
  Hashing the content rather than the blob means a rebuild that finds nothing
  changed keeps the same `ETag`, so a client's daily `If-None-Match` request
  returns `304` with no body. Hashing the gzip output would be fragile: zlib is
  not guaranteed byte-stable across versions.
- Rows are sorted by owner then name so identical data always serializes
  identically, which is what makes the content hash stable.
- `Cache-Control: public, max-age=3600`, `Content-Encoding: gzip` when accepted,
  and `Vary: Accept-Encoding`.
- `?meta=true` returns just the metadata, for callers that want to check freshness
  before committing to a download.

The endpoint is designed so a delta route can be added later without changing the
client cache format: clients key off `schemaVersion` + `ETag`, not off having
downloaded the whole thing.

### Storage: blob, not table

The feed exceeds Table Storage's limits (64 KB per property, 1 MB per entity),
so it lives as a single gzipped blob in the shared `snapshots` container on the storage
account the Function App already uses. Stored gzipped because that is the form
most requests are served in, keeping blob-to-function transfer small on cold
starts.

### Building: scheduled, not on request

`VersionsWarmup` rebuilds daily at 04:30 UTC. Building requires a full O(n) table
scan, which must never happen inside a user request - the same reasoning that
produced `StatsWarmup`. `ActionsVersions` keeps an on-demand build guarded by an
in-process lock as a fallback for the first request after a fresh deployment, and
returns `503` with `Retry-After` if that still yields nothing.

Upstream (`api-upsert.yml`) pushes data every ~6 hours, so a daily rebuild means
the feed can lag the table by a few hours. That is well inside the daily
refresh cadence clients are told to use, and every response carries
`generatedAt` so consumers can state the age rather than implying the data is live.

## SHA Availability

Roughly half the dataset stores `tagInfo` as plain version strings with no SHA
attached. Those rows report `latestSha: null`.

**A null SHA means unknown, not none.** Consumers must not substitute a SHA from
another version. The extension's tool output says this in words, because the
failure mode being prevented is a model filling the gap with something plausible.

SHAs are read from `versionShaMap` when present (the shape agreed in
[version-sha-map.md](version-sha-map.md)) and from `{ sha, tag }` objects in
`tagInfo` otherwise, with `versionShaMap` taking precedence.

## Status

Accepted

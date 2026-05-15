# Version SHA Map

## Context
The data model stores `tagInfo` and `releaseInfo` as plain string arrays (version names only). Downstream consumers such as the MCP server need to map version strings to their underlying Git commit SHAs so that clients can pin actions to exact commits (a supply-chain security best practice).

## Decision
Add an optional `versionShaMap` field to action records:

```json
{
  "tagInfo": ["v1.0.0", "v1.1.0"],
  "releaseInfo": ["v1.1.0", "v1.0.0"],
  "versionShaMap": {
    "v1.0.0": "abc123def456789...",
    "v1.1.0": "789abc012def345..."
  }
}
```

### Shape: flat `{ version: sha }` object
- O(1) lookup by version string.
- Deduplicates when the same version appears in both `tagInfo` and `releaseInfo`.
- Additive: records without the field are treated as "SHAs not yet resolved."

### Population responsibility
The external indexer (separate repo) populates `versionShaMap` during its data-gathering pass. It already authenticates to GitHub and iterates repos. Enrichment uses:
- `GET /repos/{owner}/{repo}/git/matching-refs/tags/` (one call per repo, returns all tag refs).
- For annotated tags: follow the tag object to get the underlying commit SHA.

No new Azure Function or scheduled job is needed in this repo.

## Rate-Limit Considerations
- ~30k actions with an average of ~5 tags each.
- Using the bulk `matching-refs` endpoint reduces API calls to ~1 per repo instead of ~5 per repo.
- Conditional requests (`If-None-Match`) for unchanged repos further reduce traffic.
- The indexer already runs incrementally; only new/changed repos need SHA resolution.

## Backward Compatibility
- Existing records without `versionShaMap` continue to work; the field is optional throughout the stack.
- The backend API and MCP server gracefully handle missing SHAs (return version string only).
- The frontend ignores `versionShaMap` unless explicitly rendering it.

## Status
Accepted

# Changelog

## 0.1.0 - unreleased

Initial version.

- Downloads a compact snapshot of the whole marketplace dataset from
  `GET /api/actions/snapshot` and caches it in the extension's global storage.
- Refreshes at most once a day using a conditional request, keeps the previous
  dataset when a refresh fails, and backs off for an hour after a failure.
- Contributes four language model tools so AI agents can resolve real action
  versions and commit SHAs instead of recalling them: `#actionVersions`,
  `#actionSearch`, `#actionDetails`, `#actionStats`.
- Marketplace explorer panel with dataset stats and a search matching the
  website's token-matching behaviour.
- Quick-pick search that copies or inserts a SHA-pinned `uses:` value.
- Status bar item showing the action count and dataset age.

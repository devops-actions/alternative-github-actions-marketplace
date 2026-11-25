# Requirements Snapshot

## Current Data Profile
- About 30k GitHub Actions records are keyed in the `actions` Azure Table by
  normalized owner and action name.
- Canonical record JSON is stored inline in `PayloadJson` up to 32,768 UTF-16
  code units. Larger records are stored losslessly in private Blob Storage and
  referenced from the Table row by `PayloadBlobName` and SHA-256 `PayloadHash`.
- The private `snapshots` container also stores distinct precomputed overview
  and versions feeds; these are not interchangeable with stored action payloads.
- Records include metadata such as owner and release information. Security
  posture details remain server-side under the data exposure policy below.

## Usage Expectations
- Initial traffic is minimal; prioritize low operating cost over peak throughput.
- API must respond quickly despite low volume; plan for aggressive response caching on popular aggregates (e.g., total action count).
- All fields searchable; initial release relies on API-side filtering rather than managed search indexes.

## Data Exposure Policy
- Do not surface vulnerability or security posture details (e.g., dependabot
  status or vulnerability counts) in the public UI or AI tool output. Keep
  them server-side to avoid exposing sensitive signals to users.

## Hosting Constraints
- Optimize for Azure services with free or near-free tiers until load grows.
- Keep architecture simple to operate: minimal moving parts, serverless where possible.
- Prepare for future enhancements (full-text search, heavier analytics) without rearchitecting the core data model.

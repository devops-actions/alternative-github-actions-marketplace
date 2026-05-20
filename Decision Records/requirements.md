# Requirements Snapshot

## Current Data Profile
- 30k GitHub Actions records stored as flat JSON (~26 MB total payload).
- Single-table workload; each record includes metadata (owner, release info, security posture).

## Usage Expectations
- Initial traffic is minimal; prioritize low operating cost over peak throughput.
- API must respond quickly despite low volume; plan for aggressive response caching on popular aggregates (e.g., total action count).
- All fields searchable; initial release relies on API-side filtering rather than managed search indexes.
- Add an authenticated user area for a personal watchlist of actions, with manual add/edit/remove support.

## Data Exposure Policy
- Do not surface vulnerability or security posture details (e.g., dependabot status, vuln counts) in the public UI; keep them server-side to avoid exposing sensitive signals to users.

## Authentication Requirement
- Public catalog pages stay anonymous.
- Watchlist routes require GitHub OAuth sign-in.
- Deployment workflows must provision OAuth app settings from repository secrets.

## Hosting Constraints
- Optimize for Azure services with free or near-free tiers until load grows.
- Keep architecture simple to operate: minimal moving parts, serverless where possible.
- Prepare for future enhancements (full-text search, heavier analytics) without rearchitecting the core data model.

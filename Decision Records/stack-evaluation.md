# Stack Evaluation: Static Web Apps + Azure Functions + Table Storage

## Objective
Validate that the Static Web Apps free tier, backed by an Azure Functions API and Azure Table Storage, satisfies early-stage traffic, latency, and cost goals.

## Evaluation Tasks
1. Build a proof-of-concept Static Web App with a simple search UI and deploy to the free tier.
2. Evaluate Azure Functions API filtering across the owner-partitioned `actions` Table. The frontend overview and state pages use the precomputed `/actions/snapshot`; do not put a full Table scan on the page-load path.
3. Measure cold-start latency for Functions and assess caching strategies (HTTP cache headers, precomputed aggregates and feeds in private Blob Storage).
4. Track free-tier quota consumption: function executions, bandwidth (100 GB/mo), and storage (0.5 GB per app).
5. Document deployment workflow (GitHub Actions integration, environment configuration) and highlight any gaps.

## Success Criteria
- Sub-second median response time for cached queries and <2s for cache misses during POC load tests.
- Free-tier limits remain sufficient for projected six-month traffic scenarios.
- Operational overhead (infrastructure, monitoring) stays within minimal effort expectations.

## Risks & Mitigations
- **Functions cold starts**: Warm-up timers or premium plan considerations if latency spikes become unacceptable.
- **Table Storage query limits**: Optimize owner-partition access and use continuation tokens to stay within throughput limits. Keep oversized action payloads in the private blob overflow path rather than relying on Table string/entity limits.
- **Search fidelity**: Revisit Azure AI Search or custom indexing if complex querying becomes necessary.

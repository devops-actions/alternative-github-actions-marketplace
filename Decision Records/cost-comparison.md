# Cost Comparison: Upgrade Paths

## Baseline Stack (Target Launch)
- **Static Web Apps Free**: $0/month, 100 GB bandwidth, 0.5 GB storage, SSL, GitHub Actions integration.
- **Azure Functions Consumption**: ~1M executions and 400k GB-s free; overage $0.20 per million executions, $0.000016 per GB-s.
- **Azure Table Storage (Hot)**: ~26 MB data footprint; typically <$0.01/month including storage and modest transactions.

## Managed Search Option
- **Azure AI Search Basic**: ~$74/month per search unit; adds full-text indexing, scoring, semantic search. Requires dedicated pricing plan even at low load.
- **Impact**: Largest cost jump; adopt only when API filtering cannot meet search experience requirements.

## Relational Upgrade Path
- **Azure SQL Database Serverless (Hyperscale 0.5-4 vCore)**: Compute billed $0.000105 per vCore-second with auto-pause; storage $0.25/GB per month.
- **App Service Plan (B1)**: ~$55/month for always-on web/API hosting if Static Web Apps limitations become blockers.
- **Redis Cache Basic (C0)**: ~$16/month for 250 MB cache when latency or session management necessitates dedicated caching.

## NoSQL & Container Path
- **Azure Cosmos DB Serverless (Core SQL)**: $0.25 per million RU + $0.25/GB storage; ideal for bursty workloads once Table Storage throughput constrains queries.
- **Azure Container Apps (Consumption)**: First 180k vCPU-s, 360k GiB-s, and 2M requests free; overage at $0.000024/vCPU-s and $0.000003/GiB-s, useful for microservice/API pivot.

## Cost Monitoring Actions
1. Track monthly consumption via Azure Cost Management dashboards; set alerts near free-tier limits.
2. Re-run Azure Pricing Calculator quarterly with updated traffic forecasts (region, redundancy, bandwidth).
3. Capture decision criteria for moving to paid tiers (search relevance, sustained traffic, cold-start tolerance) within project documentation.

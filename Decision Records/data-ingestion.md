# Data Ingestion & Update Plan

## Goal
Provide an HTTP API that accepts a single GitHub Actions record, stores it in Azure Table Storage, and only writes when the payload differs from what is already persisted. The API must support external callers that bulk-load new data and later push targeted updates, with an emphasis on low-latency and atomic writes.

## Storage Layout
- **Table**: `actions` (same as baseline template).
- **Keys**:
  - `PartitionKey`: normalized owner (e.g., lowercase repo owner). Clustering by owner keeps related actions co-located and enables efficient point lookups.
  - `RowKey`: normalized action name (unique per owner). Combined key yields a stable identifier while staying inside 1 KB row-key limit.
- **Columns**:
  - `LastSyncedUtc`: timestamp of the last successfully persisted payload.
  - `PayloadHash`: SHA-256 hash (Base64/hex) of the canonical JSON payload to detect changes quickly.
  - `PayloadJson`: compressed or raw JSON string for the record. Maintains the flexible schema without extra columns.

## Ingestion Workflow
1. **Request**: Client `POST /api/ActionsUpsert` with JSON body matching the record schema.
2. **Validation**: Function validates required fields (`owner`, `name`) and canonicalizes values (trim, lowercase for keys, ISO timestamps).
3. **Lookup**: Use `TableClient.getEntity(partitionKey, rowKey)` to retrieve existing entry; handle 404 as "new record".
4. **Change Detection**:
   - Compute new hash from the canonical JSON string.
   - If entity exists and `PayloadHash` matches, return HTTP 200 with `updated: false`.
   - If hashes differ or entity missing, proceed to upsert.
5. **Upsert**:
   - Build entity with latest `PayloadJson`, `PayloadHash`, and `LastSyncedUtc` (`DateTime.UtcNow`).
   - Use `UpsertEntity` with `TableUpdateMode.Merge` to keep metadata or `TableUpdateMode.Replace` if a full overwrite is desired.
   - For strict atomicity, if the entity exists, supply the current `ETag` and call `UpdateEntity`/`SetEntity` with `IfMatch` semantics. Retry on `412 Precondition Failed` with a fresh read.
6. **Response**: Return HTTP 200 with `updated: true` and timestamps; 201 optional for new inserts.

## Implementation Notes
- **Language**: Node.js Azure Functions (v4 runtime). Use `@azure/data-tables` SDK for async operations and ETag handling.
- **Cold Start Mitigation**: Keep `TableClient` cached in module scope to reuse connections across invocations.
- **Serialization**: Canonicalize JSON (sorted keys) before hashing to avoid false positives; reuse the same ordering for storage to ensure diffs reflect real changes.
- **Concurrency**: When bulk-loading, parallelize by owner partitions to avoid throttling. Each Function call handles one record; orchestrate via durable queue/logic outside scope.
- **Latency**: Typical single-entity operations run sub-50ms; ensure the function returns early without writes when unchanged to reduce RU/s consumption.

## Future Enhancements
- Batch API (`POST /api/ActionsUpsert/batch`) to handle up to 100 records per call using `TableTransactionAction` for grouped updates.
- Secondary cache (Redis) to accelerate read-heavy search once the dataset grows beyond memory-friendly sizes.
- Scheduled job to purge stale records or archive payload history to Blob Storage for audit trails.

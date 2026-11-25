# Data Ingestion & Update Plan

## Goal
Provide an HTTP API that accepts a single GitHub Actions record, stores it in Azure Table Storage with private Blob Storage overflow for oversized payloads, and only writes when the payload differs from what is already persisted. The API must support external callers that bulk-load new data and later push targeted updates, with an emphasis on low-latency and atomic writes.

## Storage Layout
- **Table**: `actions` (same as baseline template).
- **Keys**:
  - `PartitionKey`: normalized owner (e.g., lowercase repo owner). Clustering by owner keeps related actions co-located and enables efficient point lookups.
  - `RowKey`: normalized action name (unique per owner). Combined key yields a stable identifier while staying inside 1 KB row-key limit.
- **Columns**:
  - `LastSyncedUtc`: timestamp of the last successfully persisted payload.
  - `PayloadHash`: lowercase hexadecimal SHA-256 hash of the canonical JSON payload to detect changes quickly.
  - `PayloadJson`: canonical JSON for records up to 32,768 UTF-16 code units (Azure's 64 KB string-property limit).
  - `PayloadBlobName`: for larger records, replaces `PayloadJson` with a private blob reference, `payloads/{PayloadHash}.json`, in the existing snapshot container. The blob contains the complete canonical JSON, including append-only `immutableReleaseObservations`.

### Oversized Payloads
The November 2026 uploader failures include `overtrue/overtrue_phplint` (36,882
canonical JSON code units, 33,993 in observation history) and
`python-semantic-release/python-semantic-release_python-semantic-release`
(83,366 code units). These cannot fit in a single Table string property.
Trimming release lists is not sufficient, and trimming observation history would
lose required data. Splitting across Table properties would merely move the
failure to the 1 MB entity limit as history grows.

Write the content-addressed blob before publishing its Table reference. Creation
uses `If-None-Match: *`; an already existing blob is not overwritten. Table
creation and ETag-conditional replacement remain the atomic commit point. Failed
or competing Table writes may leave unreferenced blobs, but must never delete
blobs in the request path: another row/writer/reader can still reference them.
No production migration or garbage collection is performed by this change.

All API, direct-client, snapshot, versions, and stats readers hydrate references
and verify the SHA-256 before parsing. Missing, corrupt, or unreadable referenced
blobs fail explicitly rather than returning metadata-only records or omitting
actions from feeds. Legacy inline rows remain readable, and small updates use
Table `Replace` to remove obsolete references. Canonical hashes and HTTP payloads
are unchanged.

This reuses private Blob Storage, its connection string/managed identity, and
the existing snapshot container (default `snapshots`); no new Azure service or
role is required. Only oversized writes/reads add blob operations and retained
payload versions add storage cost. Direct Table clients need the updated package,
blob read/write access, and `blobEndpoint` (or the storage connection string);
existing HTTP uploaders require no package or checks-repository change.

## Ingestion Workflow
1. **Request**: Client `POST /api/ActionsUpsert` with JSON body matching the record schema.
2. **Validation**: Function validates required fields (`owner`, `name`) and canonicalizes values (trim, lowercase for keys, ISO timestamps).
3. **Lookup**: Use `TableClient.getEntity(partitionKey, rowKey)` to retrieve existing entry; handle 404 as "new record".
4. **Change Detection**:
   - Compute new hash from the canonical JSON string.
   - If entity exists and `PayloadHash` matches, return HTTP 200 with `updated: false`.
   - If hashes differ or entity missing, proceed to upsert.
5. **Upsert**:
   - Use `prepareActionEntity` to retain canonical JSON in `PayloadJson` when it is at most 32,768 UTF-16 code units, or first create/verify the immutable private blob and then store its `PayloadBlobName` reference for larger records.
   - For a new row, create the entity. For an existing row, replace it using its current ETag; on a `412 Precondition Failed`, read again and retry or return unchanged if the hash now matches.
   - Do not remove content-addressed blobs from a request path: a failed or competing Table write can leave an unreferenced blob, and other readers or rows may still use it.
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

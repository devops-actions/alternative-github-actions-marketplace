const path = require('path');
const { ActionRecord } = require('../lib/actionRecord');

const sampleActions = require(path.join(__dirname, 'data', 'sampleActions.json'));

describe('ActionRecord', () => {
  const basePayload = sampleActions[0];

  it('normalizes owner and name when created from request payload', () => {
    const payload = {
      ...basePayload,
      owner: `  ${basePayload.owner}  `,
      name: ` ${basePayload.name}\t`
    };

    const record = ActionRecord.fromRequest(payload);
    const sanitized = ActionRecord.sanitize(payload);
    const expectedCanonical = ActionRecord.canonicalize(sanitized);

    expect(record.owner).toBe(basePayload.owner);
    expect(record.name).toBe(basePayload.name);
    expect(record.partitionKey).toBe(basePayload.owner.toLowerCase());
    expect(record.rowKey).toBe(basePayload.name.toLowerCase());
    expect(record.canonicalJson).toBe(expectedCanonical);
    expect(record.hash).toBe(ActionRecord.hashPayload(expectedCanonical));
  });

  it('throws when required fields are missing', () => {
    expect(() => ActionRecord.fromRequest({ name: basePayload.name })).toThrow('Missing required field: owner');
    expect(() => ActionRecord.fromRequest({ owner: basePayload.owner })).toThrow('Missing required field: name');
  });

  it('emits table entity with canonical payload and timestamp', () => {
    const record = ActionRecord.fromRequest(basePayload);
    const timestamp = new Date('2025-01-01T12:00:00Z');

    const entity = record.toEntity(timestamp);

    expect(entity).toEqual({
      partitionKey: record.partitionKey,
      rowKey: record.rowKey,
      PayloadJson: record.canonicalJson,
      PayloadHash: record.hash,
      LastSyncedUtc: timestamp.toISOString(),
      Owner: record.owner,
      Name: record.name
    });
  });

  it('rebuilds record from stored entity payload and metadata', () => {
    const record = ActionRecord.fromRequest(basePayload);
    const entity = {
      PartitionKey: record.partitionKey,
      RowKey: record.rowKey,
      PayloadJson: JSON.stringify({
        ...basePayload,
        owner: undefined,
        name: undefined
      }),
      PayloadHash: record.hash,
      LastSyncedUtc: '2025-01-01T12:00:00Z',
      Owner: record.owner,
      Name: record.name
    };

    const rehydrated = ActionRecord.fromEntity(entity);

    expect(rehydrated.partitionKey).toBe(record.partitionKey);
    expect(rehydrated.rowKey).toBe(record.rowKey);
    expect(rehydrated.owner).toBe(record.owner);
    expect(rehydrated.name).toBe(record.name);
    expect(rehydrated.hash).toBe(record.hash);
    expect(rehydrated.canonicalJson).toBe(record.canonicalJson);
  });

  it('detects whether a stored entity already matches the current payload', () => {
    const record = ActionRecord.fromRequest(basePayload);
    const matching = { PayloadHash: record.hash };
    const nonMatching = { PayloadHash: 'different-hash' };

    expect(record.matchesExisting(matching)).toBe(true);
    expect(record.matchesExisting(nonMatching)).toBe(false);
  });

  it('includes metadata when requested via toActionInfo', () => {
    const record = ActionRecord.fromRequest(basePayload);
    const metadata = { etag: 'etag123', lastModified: '2025-01-01T12:00:00Z' };

    const info = record.toActionInfo(true, metadata);

    expect(info.owner).toBe(basePayload.owner);
    expect(info.name).toBe(basePayload.name);
    expect(info._metadata).toEqual({
      partitionKey: record.partitionKey,
      rowKey: record.rowKey,
      payloadHash: record.hash,
      ...metadata
    });

    const payloadOnly = record.toActionInfo();
    expect(payloadOnly).not.toHaveProperty('_metadata');
    expect(payloadOnly).toEqual(JSON.parse(record.canonicalJson));
  });
});

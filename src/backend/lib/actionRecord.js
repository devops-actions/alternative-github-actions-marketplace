const crypto = require('crypto');

class ActionRecord {
  constructor(raw, canonicalJson, hash, partitionKey, rowKey) {
    this.raw = raw;
    this.canonicalJson = canonicalJson;
    this.hash = hash;
    this.partitionKey = partitionKey;
    this.rowKey = rowKey;
    this.owner = raw.owner;
    this.name = raw.name;
  }

  static fromRequest(payload) {
    const sanitized = ActionRecord.sanitize(payload);
    if (!sanitized) {
      throw new Error('Request body must be a JSON object.');
    }

    const owner = ActionRecord.ensureField(sanitized.owner, 'owner');
    const name = ActionRecord.ensureField(sanitized.name, 'name');

    const canonicalJson = ActionRecord.canonicalize(sanitized);
    const hash = ActionRecord.hashPayload(canonicalJson);

    const partitionKey = ActionRecord.normalizeKey(owner);
    const rowKey = ActionRecord.normalizeKey(name);

    return new ActionRecord({ ...sanitized, owner, name }, canonicalJson, hash, partitionKey, rowKey);
  }

  static sanitize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }

    const clone = JSON.parse(JSON.stringify(input));

    if (typeof clone.owner === 'string') {
      clone.owner = clone.owner.trim();
    }
    if (typeof clone.name === 'string') {
      clone.name = clone.name.trim();
    }

    return clone;
  }

  static ensureField(value, fieldName) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required field: ${fieldName}`);
    }
    return value;
  }

  static normalizeKey(value) {
    return String(value).trim().toLowerCase();
  }

  static sortValue(value) {
    if (Array.isArray(value)) {
      return value.map(ActionRecord.sortValue);
    }
    if (value && typeof value === 'object') {
      const sorted = {};
      const keys = Object.keys(value).sort();
      keys.forEach((key) => {
        sorted[key] = ActionRecord.sortValue(value[key]);
      });
      return sorted;
    }
    return value;
  }

  static canonicalize(record) {
    return JSON.stringify(ActionRecord.sortValue(record));
  }

  static hashPayload(canonicalJson) {
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
  }

  static fromEntity(entity) {
    if (!entity) {
      throw new Error('Entity is required.');
    }

    const payload = typeof entity.PayloadJson === 'string'
      ? JSON.parse(entity.PayloadJson)
      : (entity.PayloadJson || {});

    if (!payload.owner && entity.Owner) {
      payload.owner = entity.Owner;
    }
    if (!payload.name && entity.Name) {
      payload.name = entity.Name;
    }

    const sanitized = ActionRecord.sanitize(payload);

    if (!sanitized) {
      throw new Error('Stored payload is not a valid object.');
    }

    const owner = ActionRecord.ensureField(sanitized.owner, 'owner');
    const name = ActionRecord.ensureField(sanitized.name, 'name');

    const canonicalJson = ActionRecord.canonicalize(sanitized);
    const expectedHash = entity.PayloadHash || ActionRecord.hashPayload(canonicalJson);
    const partitionKey = entity.partitionKey || entity.PartitionKey || ActionRecord.normalizeKey(owner);
    const rowKey = entity.rowKey || entity.RowKey || ActionRecord.normalizeKey(name);

    return new ActionRecord({ ...sanitized, owner, name }, canonicalJson, expectedHash, partitionKey, rowKey);
  }

  matchesExisting(entity) {
    return Boolean(entity && entity.PayloadHash === this.hash);
  }

  toEntity(timestamp = new Date()) {
    const isoTimestamp = timestamp.toISOString();

    return {
      partitionKey: this.partitionKey,
      rowKey: this.rowKey,
      PayloadJson: this.canonicalJson,
      PayloadHash: this.hash,
      LastSyncedUtc: isoTimestamp,
      Owner: this.owner,
      Name: this.name
    };
  }

  toActionInfo(includeMetadata = false, metadata = {}) {
    const payload = JSON.parse(this.canonicalJson);

    if (!includeMetadata) {
      return payload;
    }

    return {
      ...payload,
      _metadata: {
        partitionKey: this.partitionKey,
        rowKey: this.rowKey,
        payloadHash: this.hash,
        ...metadata
      }
    };
  }
}

module.exports = {
  ActionRecord
};

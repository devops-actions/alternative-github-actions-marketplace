class FakeTableClient {
  constructor() {
    this.store = new Map();
  }

  _key(partitionKey, rowKey) {
    return `${partitionKey}||${rowKey}`;
  }

  async getEntity(partitionKey, rowKey) {
    const key = this._key(partitionKey, rowKey);
    const entity = this.store.get(key);
    if (!entity) {
      const err = new Error('Not Found');
      err.statusCode = 404;
      throw err;
    }
    return { ...entity };
  }

  async createEntity(entity) {
    const key = this._key(entity.partitionKey, entity.rowKey);
    if (this.store.has(key)) {
      const err = new Error('Conflict');
      err.statusCode = 409;
      throw err;
    }
    const stored = { ...entity, etag: 'W/"1"' };
    this.store.set(key, stored);
    return stored;
  }

  async updateEntity(entity, _mode = 'Replace', options = {}) {
    const key = this._key(entity.partitionKey, entity.rowKey);
    const existing = this.store.get(key);
    if (!existing) {
      const err = new Error('Not Found');
      err.statusCode = 404;
      throw err;
    }
    if (options && options.etag && existing.etag !== options.etag) {
      const err = new Error('Precondition Failed');
      err.statusCode = 412;
      throw err;
    }
    // bump etag
    const currentVersion = parseInt(existing.etag.replace(/\D/g, ''), 10) || 1;
    const nextVersion = currentVersion + 1;
    const updated = { ...entity, etag: `W/"${nextVersion}"` };
    this.store.set(key, updated);
    return updated;
  }
}

module.exports = { FakeTableClient };

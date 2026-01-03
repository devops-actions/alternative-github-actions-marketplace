const { ActionRecord } = require('../lib/actionRecord');
const { createTableClient } = require('../lib/tableStorage');

class ActionsMarketplaceClient {
  constructor(options = {}) {
    if (options.apiUrl) {
      this.apiUrl = options.apiUrl.replace(/\/$/, '');
      this.useHttpApi = true;
    } else {
      this.tableClient = createTableClient(options);
      this.useHttpApi = false;
    }
  }

  async upsertAction(actionData) {
    const record = ActionRecord.fromRequest(actionData);

    if (this.useHttpApi) {
      return this._upsertViaHttp(record);
    }

    return this._upsertViaTable(record);
  }

  async _upsertViaHttp(record) {
    const payload = record.toActionInfo(false);
    
    const response = await fetch(`${this.apiUrl}/api/ActionsUpsert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to upsert action via HTTP API: ${response.status} ${errorBody}`);
    }

    return response.json();
  }

  async _upsertViaTable(record) {
    const existing = await this._fetchExisting(record.partitionKey, record.rowKey);

    if (record.matchesExisting(existing)) {
      return {
        updated: false,
        created: false,
        owner: record.owner,
        name: record.name,
        lastSyncedUtc: existing.LastSyncedUtc
      };
    }

    const result = await this._persistActionRecord(record, existing);

    return {
      updated: result.updated,
      created: result.created,
      owner: record.owner,
      name: record.name,
      lastSyncedUtc: result.lastSyncedUtc
    };
  }

  async _fetchExisting(partitionKey, rowKey) {
    try {
      return await this.tableClient.getEntity(partitionKey, rowKey);
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async _persistActionRecord(record, existing) {
    const entity = record.toEntity();

    if (!existing) {
      try {
        await this.tableClient.createEntity(entity);
        return { updated: true, created: true, lastSyncedUtc: entity.LastSyncedUtc };
      } catch (error) {
        if (error.statusCode !== 409) {
          throw error;
        }
        const latest = await this.tableClient.getEntity(entity.partitionKey, entity.rowKey);
        return this._persistActionRecord(record, latest);
      }
    }

    try {
      await this.tableClient.updateEntity(entity, 'Replace', { etag: existing.etag });
      return { updated: true, created: false, lastSyncedUtc: entity.LastSyncedUtc };
    } catch (error) {
      if (error.statusCode !== 412) {
        throw error;
      }
      const latest = await this.tableClient.getEntity(entity.partitionKey, entity.rowKey);
      if (record.matchesExisting(latest)) {
        return { updated: false, created: false, lastSyncedUtc: latest.LastSyncedUtc };
      }
      return this._persistActionRecord(record, latest);
    }
  }

  async batchUpsertActions(actions) {
    const results = [];
    
    for (const action of actions) {
      try {
        const result = await this.upsertAction(action);
        results.push({ success: true, action: `${action.owner}/${action.name}`, result });
      } catch (error) {
        results.push({ success: false, action: `${action.owner}/${action.name}`, error: error.message });
      }
    }

    return results;
  }
}

module.exports = {
  ActionsMarketplaceClient,
  ActionRecord
};

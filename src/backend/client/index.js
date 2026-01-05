const { ActionRecord } = require('../lib/actionRecord');
const { createTableClient } = require('../lib/tableStorage');

class ActionsMarketplaceClient {
  constructor(options = {}) {
    if (options.apiUrl) {
      this.apiUrl = options.apiUrl.replace(/\/$/, '');
      this.functionKey = options.functionKey;
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
    
    let url = `${this.apiUrl}/api/ActionsUpsert`;
    if (this.functionKey) {
      url += `?code=${encodeURIComponent(this.functionKey)}`;
    }
    
    const response = await fetch(url, {
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
      const actionName = (action && action.owner && action.name) 
        ? `${action.owner}/${action.name}` 
        : 'unknown';
      
      try {
        const result = await this.upsertAction(action);
        results.push({ success: true, action: `${action.owner}/${action.name}`, result });
      } catch (error) {
        results.push({ success: false, action: actionName, error: error.message });
      }
    }

    return results;
  }

  async listActions(options = {}) {
    if (this.useHttpApi) {
      return this._listViaHttp(options);
    }

    return this._listViaTable(options);
  }

  async _listViaHttp(options = {}) {
    const owner = options.owner;
    let url = `${this.apiUrl}/api/actions/list`;
    
    if (owner) {
      url += `/${encodeURIComponent(owner)}`;
    }
    
    if (this.functionKey) {
      url += `?code=${encodeURIComponent(this.functionKey)}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to list actions via HTTP API: ${response.status} ${errorBody}`);
    }

    const body = await response.json();
    
    if (!Array.isArray(body)) {
      throw new Error('Invalid response format: expected an array of actions');
    }

    return body;
  }

  async _listViaTable(options = {}) {
    const owner = options.owner;
    const entities = [];
    
    try {
      let queryOptions = {};
      
      if (owner) {
        // Sanitize owner to prevent OData injection - escape single quotes
        const sanitizedOwner = String(owner).toLowerCase().replace(/'/g, "''");
        queryOptions = { queryOptions: { filter: `PartitionKey eq '${sanitizedOwner}'` } };
      }
      
      for await (const entity of this.tableClient.listEntities(queryOptions)) {
        try {
          const record = ActionRecord.fromEntity(entity);
          const actionInfo = record.toActionInfo(true, {
            etag: entity.etag,
            lastSyncedUtc: entity.LastSyncedUtc,
            partitionKey: entity.partitionKey,
            rowKey: entity.rowKey
          });
          entities.push(actionInfo);
        } catch (error) {
          // Skip entities that can't be parsed
          continue;
        }
      }
      
      return entities;
    } catch (error) {
      throw new Error(`Failed to list actions from table storage: ${error.message}`);
    }
  }
}

module.exports = {
  ActionsMarketplaceClient,
  ActionRecord
};

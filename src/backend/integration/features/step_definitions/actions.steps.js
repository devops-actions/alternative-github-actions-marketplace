const path = require('path');
const { Given, When, Then, Before, After } = require('@cucumber/cucumber');
const { ActionRecord } = require('../../../lib/actionRecord');
const upsert = require('../../../ActionsUpsert');
const getFn = require('../../../ActionsGet');
const { setTableClient } = require('../../../lib/tableStorage');
const { FakeTableClient } = require('../../support/fakeTableClient');

const sampleActions = require(path.join(__dirname, '../../../tests/data/sampleActions.json'));

Then('the search response should contain exactly {int} action with owner {string}', function (count, owner) {
  if (!this.state.searchResults || this.state.searchResults.length !== count) {
    throw new Error(`Expected exactly ${count} result(s), got ${this.state.searchResults ? this.state.searchResults.length : 0}`);
  }
  const ownerCount = this.state.searchResults.filter(e => (e.Owner || (e.PayloadJson && JSON.parse(e.PayloadJson).owner)) === owner).length;
  if (ownerCount !== count) {
    throw new Error(`Expected exactly ${count} actions for owner ${owner}, got ${ownerCount}`);
  }
  // Optionally record per-owner search results if needed later
  if (!this.state.ownerSearchResultsByOwner) this.state.ownerSearchResultsByOwner = {};
  this.state.ownerSearchResultsByOwner[owner] = this.state.searchResults.map(e => e.Name || (e.PayloadJson && JSON.parse(e.PayloadJson).name));
});

Then('the Owner2 search result should not be present in the Owner1 search results', function () {
  const owner2Result = this.state.searchResults && this.state.searchResults[0];
  const owner2Name = owner2Result && (owner2Result.Name || (owner2Result.PayloadJson && JSON.parse(owner2Result.PayloadJson).name));
  if (!owner2Name) throw new Error('No Owner2 result to compare');

  const owner1Results =
    this.state.ownerSearchResultsByOwner && this.state.ownerSearchResultsByOwner['Owner1'];
  if (!owner1Results || owner1Results.length === 0) {
    throw new Error('No Owner1 search results recorded for comparison');
  }

  if (owner1Results.includes(owner2Name)) {
    throw new Error('Owner2 result is present in Owner1 search results');
  }
});










function createContext(owner, name) {
  return {
    log: {
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    bindingData: owner && name ? { owner, name } : {}
  };
}

Then('the search response should contain at least {int} actions with owner {string}', function (count, owner) {
  if (!this.state.searchResults || this.state.searchResults.length < count) {
    throw new Error(`Expected at least ${count} results, got ${this.state.searchResults ? this.state.searchResults.length : 0}`);
  }
  const ownerCount = this.state.searchResults.filter(e => (e.Owner || (e.PayloadJson && JSON.parse(e.PayloadJson).owner)) === owner).length;
  if (ownerCount < count) {
    throw new Error(`Expected at least ${count} actions for owner ${owner}, got ${ownerCount}`);
  }
  // Record these results by owner for later comparison (e.g. Owner1 vs Owner2)
  if (!this.state.ownerSearchResultsByOwner) this.state.ownerSearchResultsByOwner = {};
  this.state.ownerSearchResultsByOwner[owner] = this.state.searchResults.map(e => e.Name || (e.PayloadJson && JSON.parse(e.PayloadJson).name));
});

Given('sample action payloads at indices {int}, {int}, {int}, {int}, {int}', function (i0, i1, i2, i3, i4) {
  this.state.payloads = [i0, i1, i2, i3, i4].map(i => sampleActions[i]);
});

When('I upsert all actions', async function () {
  this.state.upsertResults = [];
  for (const payload of this.state.payloads) {
    const context = createContext();
    const req = { method: 'POST', body: payload };
    await upsert(context, req);
    this.state.upsertResults.push(context.res);
  }
});

Then('the upsert response status for all should be {int}', function (status) {
  if (!this.state.upsertResults || this.state.upsertResults.length === 0) throw new Error('No upsert results');
  for (const res of this.state.upsertResults) {
    if (res.status !== status) {
      throw new Error(`Expected ${status} but got ${res.status}`);
    }
  }
});

Then('the table should contain {int} entities', function (count) {
  const all = Array.from(this.client.store.values());
  if (all.length !== count) {
    throw new Error(`Expected ${count} entities but found ${all.length}`);
  }
});

When('I search for actions by owner {string}', async function (owner) {
  // Placeholder: will call the search/list endpoint when implemented
  this.state.searchOwner = owner;
  // Simulate search in fake table for now
  const all = Array.from(this.client.store.values());
  this.state.searchResults = all.filter(e => (e.Owner || (e.PayloadJson && JSON.parse(e.PayloadJson).owner)) === owner);
});

Then('the search response should contain at least 1 action with owner {string}', function (owner) {
  if (!this.state.searchResults || this.state.searchResults.length === 0) throw new Error('No search results');
  if (!this.state.searchResults.some(e => (e.Owner || (e.PayloadJson && JSON.parse(e.PayloadJson).owner)) === owner)) {
    throw new Error(`No actions found for owner ${owner}`);
  }
});

Then('the search response should be empty', function () {
  if (this.state.searchResults && this.state.searchResults.length > 0) {
    throw new Error('Expected no search results');
  }
});

Before(function () {
  this.client = new FakeTableClient();
  setTableClient(this.client);
  this.state = {};
});

After(function () {
  setTableClient(undefined);
});

Given('a clean table storage', function () {
  // Already ensured by Before hook
});

Given('a sample action payload at index {int}', function (index) {
  this.state.payload = sampleActions[index];
  const record = ActionRecord.fromRequest(this.state.payload);
  this.state.partitionKey = record.partitionKey;
  this.state.rowKey = record.rowKey;
});

When('I upsert the action', async function () {
  const context = createContext();
  const req = { method: 'POST', body: this.state.payload };
  await upsert(context, req);
  this.state.upsertRes = context.res;
});

Then('the upsert response status should be {int}', function (status) {
  if (!this.state.upsertRes) throw new Error('No upsert response');
  if (this.state.upsertRes.status !== status) {
    throw new Error(`Expected ${status} but got ${this.state.upsertRes.status}`);
  }
});

Then('the table entity should exist', async function () {
  const entity = await this.client.getEntity(this.state.partitionKey, this.state.rowKey).catch(() => null);
  if (!entity) throw new Error('Entity not found after upsert');
  this.state.entity = entity;
});

When('I get the action by owner and name', async function () {
  const context = createContext(this.state.payload.owner, this.state.payload.name);
  const req = { method: 'GET' };
  await getFn(context, req);
  this.state.getRes = context.res;
});

Then('the get response status should be {int}', function (status) {
  if (!this.state.getRes) throw new Error('No get response');
  if (this.state.getRes.status !== status) {
    throw new Error(`Expected ${status} but got ${this.state.getRes.status}`);
  }
});

Then('the get response should include the action payload and metadata', function () {
  const body = this.state.getRes && this.state.getRes.body;
  if (!body) throw new Error('Missing response body');
  if (body.owner !== this.state.payload.owner || body.name !== this.state.payload.name) {
    throw new Error('Owner or name does not match');
  }
  if (!body._metadata) throw new Error('Missing metadata');
  const md = body._metadata;
  if (!md.partitionKey || !md.rowKey || !md.payloadHash) {
    throw new Error('Missing essential metadata fields');
  }
});

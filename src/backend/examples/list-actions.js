#!/usr/bin/env node

/**
 * Example script demonstrating how to use the Actions Marketplace Client
 * to list actions from the marketplace.
 */

const { ActionsMarketplaceClient } = require('../client/index');
const { DefaultAzureCredential } = require('@azure/identity');

function normalizeApiUrl(apiUrl) {
  const cleaned = String(apiUrl || '').trim().replace(/\/+$/, '');
  if (!cleaned) {
    return {
      apiHost: 'https://your-api-endpoint.azurewebsites.net',
      apiBase: 'https://your-api-endpoint.azurewebsites.net/api'
    };

    return {
      apiHost: cleaned.slice(0, -4),
      apiBase: cleaned
    };
  }

  return {
    apiHost: cleaned,
    console.error(`::error::Failed to list actions: ${error.message}`);
    hadError = true;
  };
}

function statsExample() {
  const { apiBase } = normalizeApiUrl(process.env.API_URL);
  const url = `${apiBase}/actions/stats`;

  console.log('Smoke test: Actions Stats (HTTP API Mode)');
  console.log(`GET ${url}`);

  return fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  })
    .then(async response => {
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to fetch stats: ${response.status} ${body}`);
      }
      return response.json();
    })
    .then(stats => {
      const total = Number(stats?.total) || 0;
      const verified = Number(stats?.verified) || 0;
      console.log(`OK: total=${total}, verified=${verified}`);
      return stats;
    })
    .catch(error => {
      console.error(`::error::Stats smoke test failed for ${url}: ${error.message}`);
      process.exitCode = 1;
    });
}

async function main() {
  const { apiHost } = normalizeApiUrl(process.env.API_URL);
  let hadError = false;

  // Example 1: List all actions using HTTP API mode
  console.log('Example 1: List All Actions (HTTP API Mode)\n');
  
  const httpClient = new ActionsMarketplaceClient({
    apiUrl: apiHost,
    functionKey: process.env.FUNCTION_KEY  // Optional, if API is secured
  });

  try {
    const actions = await httpClient.listActions();
    
    console.log(`Found ${actions.length} actions in total\n`);
    
    console.error(`::error::Failed to list actions: ${error.message}`);
    hadError = true;
    const displayCount = Math.min(5, actions.length);
    if (displayCount > 0) {
      console.log(`First ${displayCount} actions:`);
      actions.slice(0, displayCount).forEach(action => {
        console.log(`  - ${action.owner}/${action.name}`);
        if (action.description) {
          console.log(`    ${action.description}`);
        }
        if (action.version) {
          console.log(`    Version: ${action.version}`);
        }
        console.log();
      });
    }
  } catch (error) {
    console.error('Failed to list actions:', error.message);
  }

  // Example 2: List actions for a specific owner
  console.log('\n\nExample 2: List Actions by Owner (HTTP API Mode)\n');
  
  try {
    const actionsOrgActions = await httpClient.listActions({ owner: 'actions' });
    
    console.log(`Found ${actionsOrgActions.length} actions from 'actions' organization\n`);
    
    actionsOrgActions.forEach(action => {
      console.log(`  - ${action.owner}/${action.name}`);
      if (action.description) {
        console.log(`    ${action.description}`);
      }
    });
  } catch (error) {
    console.error(`::error::Failed to list actions by owner: ${error.message}`);
    hadError = true;
  }

  // Example 3: Using Direct Table Storage mode
  console.log('\n\nExample 3: List Actions (Direct Table Storage Mode)\n');

  const tableEndpoint = process.env.AZURE_TABLE_ENDPOINT || process.env.TABLE_ENDPOINT;
  const tableName = process.env.AZURE_TABLE_NAME || process.env.TABLE_NAME || 'actions';

  if (!tableEndpoint) {
    console.log('Skipping Direct Table Storage examples (no AZURE_TABLE_ENDPOINT set).');
  } else {
  
    const tableClient = new ActionsMarketplaceClient({
      tableEndpoint,
      tableName,
      credential: new DefaultAzureCredential()
    });

    try {
      const actions = await tableClient.listActions();
      
      console.log(`Found ${actions.length} actions in table storage\n`);
      
      // Group actions by owner
      const actionsByOwner = {};
      actions.forEach(action => {
        if (!actionsByOwner[action.owner]) {
          actionsByOwner[action.owner] = [];
        }
        actionsByOwner[action.owner].push(action.name);
      });
      
      console.log('Actions grouped by owner:');
      Object.entries(actionsByOwner)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 5)  // Show first 5 owners
        .forEach(([owner, names]) => {
          console.log(`  ${owner}: ${names.length} action(s)`);
          names.slice(0, 3).forEach(name => {
            console.log(`    - ${name}`);
          });
          if (names.length > 3) {
            console.log(`    ... and ${names.length - 3} more`);
          }
        });
    } catch (error) {
      console.error(`::error::Failed to list actions from table storage: ${error.message}`);
      hadError = true;
    }

    // Example 4: Filter actions by owner using Table Storage
    console.log('\n\nExample 4: Filter by Owner (Direct Table Storage Mode)\n');
    
    try {
      const githubActions = await tableClient.listActions({ owner: 'github' });
      
      console.log(`Found ${githubActions.length} actions from 'github' organization\n`);
      
      githubActions.forEach(action => {
        console.log(`  - ${action.name}`);
        if (action.version) {
          console.log(`    Current version: ${action.version}`);
        }
      });
    } catch (error) {
      console.error(`::error::Failed to filter actions: ${error.message}`);
      hadError = true;
    }
  }

  if (hadError) {
    process.exitCode = 1;
  }
}

// Only run if executed directly (not when required as a module)
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { main, statsExample };

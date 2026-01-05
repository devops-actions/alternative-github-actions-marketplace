#!/usr/bin/env node

/**
 * Example script demonstrating how to use the Actions Marketplace Client
 * to list actions from the marketplace.
 */

const { ActionsMarketplaceClient } = require('../client/index');
const { DefaultAzureCredential } = require('@azure/identity');

async function main() {
  // Example 1: List all actions using HTTP API mode
  console.log('Example 1: List All Actions (HTTP API Mode)\n');
  
  const httpClient = new ActionsMarketplaceClient({
    apiUrl: process.env.API_URL || 'https://your-api-endpoint.azurewebsites.net',
    functionKey: process.env.FUNCTION_KEY  // Optional, if API is secured
  });

  try {
    const actions = await httpClient.listActions();
    
    console.log(`Found ${actions.length} actions in total\n`);
    
    // Display first 5 actions as examples
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
    console.error('Failed to list actions by owner:', error.message);
  }

  // Example 3: Using Direct Table Storage mode
  console.log('\n\nExample 3: List Actions (Direct Table Storage Mode)\n');
  
  const tableClient = new ActionsMarketplaceClient({
    tableEndpoint: process.env.AZURE_TABLE_ENDPOINT || 'https://your-account.table.core.windows.net',
    tableName: process.env.AZURE_TABLE_NAME || 'actions',
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
    console.error('Failed to list actions from table storage:', error.message);
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
    console.error('Failed to filter actions:', error.message);
  }
}

// Only run if executed directly (not when required as a module)
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { main };

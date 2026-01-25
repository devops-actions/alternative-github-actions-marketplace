// Example: Fetch README for an action
// This demonstrates the new README API endpoint with caching
// Run with: node examples/fetch-readme.js [owner] [name] [version]

const API_BASE_URL = process.env.API_URL || 'http://localhost:7071/api';

async function fetchActionReadme(owner, name, version) {
  const versionParam = version ? `?version=${encodeURIComponent(version)}` : '';
  const url = `${API_BASE_URL}/actions/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme${versionParam}`;
  
  console.log(`Fetching README from: ${url}`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch README: ${response.status} ${response.statusText}`);
  }
  
  const cacheStatus = response.headers.get('x-cache');
  const html = await response.text();
  
  return { html, cacheStatus };
}

async function main() {
  try {
    // Example: Fetch README for actions/checkout
    const owner = process.argv[2] || 'actions';
    const name = process.argv[3] || 'checkout';
    const version = process.argv[4];
    
    console.log(`Fetching README for ${owner}/${name}${version ? ` (version: ${version})` : ''}`);
    
    const { html: readme, cacheStatus } = await fetchActionReadme(owner, name, version);
    
    console.log(`\nCache Status: ${cacheStatus || 'N/A'}`);
    console.log(`README length: ${readme.length} characters`);
    console.log('\nFirst 500 characters:');
    console.log(readme.substring(0, 500));
    console.log('...\n');
    
    // Fetch again to demonstrate caching
    console.log('Fetching again to test cache...');
    const { cacheStatus: cacheStatus2 } = await fetchActionReadme(owner, name, version);
    console.log(`Cache Status on second request: ${cacheStatus2 || 'N/A'}`);
    
    console.log('\n✓ README fetched successfully');
    console.log('✓ Caching working as expected');
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}

main();

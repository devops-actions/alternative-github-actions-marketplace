const assert = require('assert');
const { buildVersionResponse } = require('../index');

function testSingleVersionWithSha() {
  const action = {
    owner: 'actions',
    name: 'checkout',
    tagInfo: ['v3.0.0', 'v4.0.0', 'v4.1.0'],
    releaseInfo: ['v4.1.0', 'v4.0.0', 'v3.0.0'],
    versionShaMap: {
      'v3.0.0': 'aaa111',
      'v4.0.0': 'bbb222',
      'v4.1.0': 'ccc333'
    }
  };

  const result = buildVersionResponse(action, 'v4.0.0');
  assert.deepStrictEqual(result, { version: 'v4.0.0', sha: 'bbb222' });
  console.log('testSingleVersionWithSha: ok');
}

function testSingleVersionWithoutSha() {
  const action = {
    owner: 'actions',
    name: 'checkout',
    tagInfo: ['v3.0.0', 'v4.0.0'],
    releaseInfo: ['v4.0.0', 'v3.0.0']
  };

  const result = buildVersionResponse(action, 'v4.0.0');
  assert.deepStrictEqual(result, { version: 'v4.0.0', sha: null });
  console.log('testSingleVersionWithoutSha: ok');
}

function testVersionNotFound() {
  const action = {
    owner: 'actions',
    name: 'checkout',
    tagInfo: ['v3.0.0'],
    releaseInfo: ['v3.0.0'],
    versionShaMap: { 'v3.0.0': 'aaa111' }
  };

  const result = buildVersionResponse(action, 'v99.0.0');
  assert.strictEqual(result, null);
  console.log('testVersionNotFound: ok');
}

function testAllVersions() {
  const action = {
    owner: 'actions',
    name: 'checkout',
    tagInfo: ['v3.0.0', 'v4.0.0'],
    releaseInfo: ['v4.0.0', 'v3.0.0'],
    versionShaMap: { 'v3.0.0': 'aaa111', 'v4.0.0': 'bbb222' }
  };

  const result = buildVersionResponse(action, null);
  assert.deepStrictEqual(result, {
    owner: 'actions',
    name: 'checkout',
    versions: [
      { version: 'v3.0.0', sha: 'aaa111' },
      { version: 'v4.0.0', sha: 'bbb222' }
    ]
  });
  console.log('testAllVersions: ok');
}

function testNullAction() {
  const result = buildVersionResponse(null, 'v1.0.0');
  assert.strictEqual(result, null);
  console.log('testNullAction: ok');
}

function testMissingShaMap() {
  const action = {
    owner: 'owner',
    name: 'action',
    tagInfo: ['v1.0.0'],
    releaseInfo: ['v1.0.0']
  };

  const result = buildVersionResponse(action, null);
  assert.deepStrictEqual(result, {
    owner: 'owner',
    name: 'action',
    versions: [{ version: 'v1.0.0', sha: null }]
  });
  console.log('testMissingShaMap: ok');
}

testSingleVersionWithSha();
testSingleVersionWithoutSha();
testVersionNotFound();
testAllVersions();
testNullAction();
testMissingShaMap();
console.log('All version lookup tests passed');

const assert = require('assert');
const http = require('http');
const { createServer } = require('../index');

function runTest() {
  const server = createServer().listen(0, () => {
    const { port } = server.address();
    http.get({ hostname: '127.0.0.1', port, path: '/health', method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          assert.strictEqual(res.statusCode, 200);
          const obj = JSON.parse(data);
          assert.strictEqual(obj.status, 'ok');
          console.log('test-health: ok');
          server.close();
        } catch (e) {
          console.error('test-health: failed', e);
          server.close();
          process.exitCode = 1;
        }
      });
    }).on('error', (e) => { console.error(e); server.close(); process.exitCode = 1; });
  });
}

runTest();

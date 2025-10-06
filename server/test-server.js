#!/usr/bin/env node

/**
 * LUMI Server Test
 */

const http = require('http');

const PORT = process.env.LUMI_PORT || 3456;
const BASE_URL = `http://127.0.0.1:${PORT}`;

console.log('Testing LUMI Server...');
console.log('======================');
console.log('');

async function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Health check
  console.log('Test 1: Health check...');
  try {
    const res = await request('GET', '/health');
    if (res.statusCode === 200 && res.body.status === 'ok') {
      console.log('✅ PASS - Server is healthy');
      console.log('   Uptime:', res.body.uptime.toFixed(2), 'seconds');
      console.log('   Working directory:', res.body.config.workingDirectory);
      passed++;
    } else {
      console.log('❌ FAIL - Unexpected response');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL - Server not reachable:', error.message);
    console.log('');
    console.log('Is the server running?');
    console.log('  Start with: npm start');
    console.log('  Or: node server.js');
    failed++;
    process.exit(1);
  }

  console.log('');

  // Test 2: Capabilities
  console.log('Test 2: CLI capabilities...');
  try {
    const res = await request('GET', '/capabilities');
    if (res.statusCode === 200) {
      console.log('✅ PASS - Capabilities retrieved');
      console.log('   CLIs:', Object.keys(res.body.cliCapabilities).join(', '));
      for (const [cli, caps] of Object.entries(res.body.cliCapabilities)) {
        if (caps.available) {
          console.log(`   ${cli}: ${caps.version}`);
        } else {
          console.log(`   ${cli}: not available`);
        }
      }
      passed++;
    } else {
      console.log('❌ FAIL');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    failed++;
  }

  console.log('');

  // Test 3: Execute endpoint (dry run)
  console.log('Test 3: Execute endpoint (validation)...');
  try {
    const res = await request('POST', '/execute', {
      engine: 'codex',
      context: {}  // Missing intent - should fail
    });
    if (res.statusCode === 400) {
      console.log('✅ PASS - Validation working (rejected invalid request)');
      passed++;
    } else {
      console.log('❌ FAIL - Should reject invalid request');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message);
    failed++;
  }

  console.log('');
  console.log('======================');
  console.log('Tests completed:');
  console.log('  ✅ Passed:', passed);
  console.log('  ❌ Failed:', failed);
  console.log('');

  if (failed === 0) {
    console.log('🎉 All tests passed!');
    console.log('');
    console.log('Server is ready to use.');
    console.log('Base URL:', BASE_URL);
  } else {
    console.log('Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});


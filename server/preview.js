#!/usr/bin/env node
// Simple prompt preview client: posts a sample context to /preview and prints the prompt
const http = require('http');
const fs = require('fs');

const PORT = process.env.LUMI_PORT || 3456;
const HOST = '127.0.0.1';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(buf) }); }
        catch (_) { resolve({ statusCode: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const samplePath = process.argv[2] || require('path').join(__dirname, 'samples', 'sample-context.json');
  if (!fs.existsSync(samplePath)) {
    console.error('Sample context not found:', samplePath);
    process.exit(1);
  }
  const context = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const res = await post('/preview', { context });
  if (res.statusCode !== 200) {
    console.error('Preview failed:', res.body);
    process.exit(1);
  }
  console.log('--- PROMPT (preview) ---');
  console.log(res.body.prompt);
  console.log('--- SUMMARY ---');
  console.log(res.body.summary);
}

main().catch(err => { console.error(err); process.exit(1); });


#!/usr/bin/env node
/* Scan for hard-coded color values outside generated tokens */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const allow = [
  /extension\/shared\/tokens\.css$/,
  /design\/tokens\.json$/
];

const colorRe = /(#[0-9a-fA-F]{3,8})|\brgba?\(|\bhsl\(/;

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'coverage' || name === 'dist') continue;
      out.push(...walk(p));
    } else if (/(\.(js|mjs|css|html))$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(root).filter(f => !allow.some(a => a.test(f)));
let errors = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Skip variable declarations like --token: value;
    if (/^--[a-z0-9\-]+:\s*/i.test(trimmed)) return;
    if (colorRe.test(line) && !line.includes('var(--')) {
      errors.push(`${path.relative(root, f)}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (errors.length) {
  console.log('[scan-hardcoded-styles] Found potential hard-coded colors:');
  errors.slice(0, 200).forEach(e => console.log('  ' + e));
  process.exitCode = 1;
} else {
  console.log('[scan-hardcoded-styles] OK');
}

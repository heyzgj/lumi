#!/usr/bin/env node
/* Build tokens.css and tokens.js from design/tokens.json */
const fs = require('fs');
const path = require('path');

function toCSS(vars) {
  return Object.entries(vars)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
}

function build() {
  const rootDir = path.resolve(__dirname, '..');
  const tokenPath = path.join(rootDir, 'design', 'tokens.json');
  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const css = `:root {\n${toCSS(tokens.light)}\n}\n:root.dark-dock {\n${toCSS(tokens.dark)}\n}\n`;
  const outDir = path.join(rootDir, 'extension', 'shared');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'tokens.css'), css, 'utf8');
  const js = `export const TOKENS_CSS = ${JSON.stringify(css)};\n`;
  fs.writeFileSync(path.join(outDir, 'tokens.js'), js, 'utf8');
  console.log('[tokens] built extension/shared/tokens.{css,js}');
}

build();


#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const defaultConfig = {
  serverUrl: 'http://127.0.0.1:3456',
  defaultEngine: 'codex',
  codex: {
    model: 'gpt-5-codex-high',
    sandbox: 'workspace-write',
    approvals: 'never',
    extraArgs: ''
  },
  claude: {
    model: 'claude-sonnet-4.5',
    tools: ['TextEditor', 'Read'],
    outputFormat: 'json',
    permissionMode: 'acceptEdits',
    extraArgs: ''
  },
  projects: []
};

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function askChoice() {
  console.log('\nWhere should LUMI store its configuration?');
  console.log('  [1] Global (~/\.lumi)  — recommended if you share settings across projects');
  console.log('  [2] Project (./.lumi)   — keep configs inside this repository');
  console.log('  [3] Custom path');

  const answer = (await question('Select option [1]: ')).trim() || '1';
  if (answer === '2') {
    return path.join(repoRoot, '.lumi');
  }
  if (answer === '3') {
    const custom = (await question('Enter absolute path: ')).trim();
    if (!custom) {
      console.log('❗️ Empty path entered, falling back to global.');
      return path.join(os.homedir(), '.lumi');
    }
    if (!path.isAbsolute(custom)) {
      console.log('❗️ Path must be absolute. Falling back to global.');
      return path.join(os.homedir(), '.lumi');
    }
    return custom;
  }
  return path.join(os.homedir(), '.lumi');
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

function readExistingConfig(configPath) {
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`⚠️  Existing config at ${configPath} is invalid JSON. It will be replaced.`);
    return null;
  }
}

async function confirm(prompt, defaultYes = true) {
  const suffix = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await question(`${prompt} [${suffix}]: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return ['y', 'yes'].includes(answer);
}

async function writeConfig(configDir) {
  const configPath = path.join(configDir, 'config.json');
  const existing = readExistingConfig(configPath);
  if (existing) {
    console.log(`\nDetected existing config at ${configPath}.`);
    const keep = await confirm('Keep current settings?', true);
    if (keep) {
      console.log('✅ Keeping existing configuration.');
      return configPath;
    }
  }

  await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`✅ Wrote new config to ${configPath}`);
  return configPath;
}

async function recordLocation(configDir) {
  const markerPath = path.join(repoRoot, '.lumi-location');
  const payload = JSON.stringify({ configDir }, null, 2);
  await fs.promises.writeFile(markerPath, payload + '\n');
  console.log(`📌 Saved config location marker at ${markerPath}`);
}

async function copySampleConfig() {
  const samplePath = path.join(repoRoot, 'docs', 'config.sample.json');
  if (fs.existsSync(samplePath)) return;
  await fs.promises.writeFile(samplePath, JSON.stringify(defaultConfig, null, 2));
  console.log('🪄 Added docs/config.sample.json for reference.');
}

async function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function installDependencies() {
  console.log('\n📦 Installing extension dependencies...');
  await runCommand('npm', ['install'], path.join(repoRoot, 'extension'));
  console.log('📦 Installing server dependencies...');
  await runCommand('npm', ['install'], path.join(repoRoot, 'server'));
}

async function checkCli(command, args = ['--version']) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

async function main() {
  console.log('🚀 LUMI Setup Starting...');
  console.log(`📁 Repository: ${repoRoot}`);

  const configDir = await askChoice();
  await ensureDir(configDir);
  const configPath = await writeConfig(configDir);
  await recordLocation(configDir);
  await copySampleConfig();

  try {
    await installDependencies();
  } catch (error) {
    console.error(`❌ Dependency installation failed: ${error.message}`);
    rl.close();
    process.exit(1);
  }

  const codexAvailable = await checkCli('codex');
  const claudeAvailable = await checkCli('claude');

  console.log('\n✅ Setup complete. Summary:');
  console.log(`  • Config directory: ${configDir}`);
  console.log(`  • Config file: ${configPath}`);
  console.log(`  • Codex CLI detected: ${codexAvailable ? 'yes' : 'no'}`);
  console.log(`  • Claude CLI detected: ${claudeAvailable ? 'yes' : 'no'}`);
  console.log('\nNext steps:');
  console.log('  1. npm run dev       # starts the local bridge server');
  console.log('  2. npm run build     # builds the Chrome extension');
  console.log('  3. Load extension/ into chrome://extensions and open the Options page to finish configuration.');

  rl.close();
}

main().catch((error) => {
  console.error('❌ Setup failed:', error);
  rl.close();
  process.exit(1);
});

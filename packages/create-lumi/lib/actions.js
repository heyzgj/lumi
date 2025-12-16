/**
 * Action helpers for create-lumi CLI
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const REPO_URL = 'https://github.com/heyzgj/lumi.git';

/**
 * Clone the Lumi repository
 */
export async function cloneRepo(targetDir, isCurrentDir = false) {
    if (isCurrentDir) {
        // Clone into current directory
        // First check if it's empty or a valid lumi repo
        if (existsSync(join(targetDir, 'package.json'))) {
            const pkg = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf8'));
            if (pkg.name === 'lumi') {
                console.log('   ⏭️  Lumi repository already exists, skipping clone');
                return;
            }
        }

        // Clone with depth 1 for speed
        await runCommand('git', ['clone', '--depth', '1', REPO_URL, '.'], targetDir);
    } else {
        // Clone into new directory
        const parentDir = join(targetDir, '..');
        mkdirSync(parentDir, { recursive: true });
        await runCommand('git', ['clone', '--depth', '1', REPO_URL, targetDir], process.cwd());
    }

    // Remove .git folder to allow user to init their own repo
    // (optional - keeping it allows easier updates)
}

/**
 * Install npm dependencies for extension and server
 */
export async function installDeps(projectDir) {
    const extensionDir = join(projectDir, 'extension');
    const serverDir = join(projectDir, 'server');

    console.log('   📦 Installing extension dependencies...');
    await runCommand('npm', ['install'], extensionDir);

    console.log('   📦 Installing server dependencies...');
    await runCommand('npm', ['install'], serverDir);
}

/**
 * Generate default configuration
 */
export async function generateConfig(projectDir) {
    const configDir = join(homedir(), '.lumi');
    const configPath = join(configDir, 'config.json');
    const markerPath = join(projectDir, '.lumi-location');

    // Create config directory
    mkdirSync(configDir, { recursive: true });

    // Only write config if it doesn't exist
    if (!existsSync(configPath)) {
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

        writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        console.log(`   📄 Created config at ${configPath}`);
    } else {
        console.log(`   ⏭️  Config already exists at ${configPath}`);
    }

    // Write marker file
    writeFileSync(markerPath, JSON.stringify({ configDir }, null, 2) + '\n');
}

/**
 * Build the Chrome extension
 */
export async function buildExtension(projectDir) {
    await runCommand('npm', ['run', 'build'], projectDir);
}

/**
 * Start the development server
 */
export async function startServer(projectDir) {
    const extensionPath = join(projectDir, 'extension');

    // Show Chrome extension loading instructions BEFORE server starts
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│  📦 Load the Chrome Extension                               │
├─────────────────────────────────────────────────────────────┤
│  1. Open Chrome → chrome://extensions                       │
│  2. Enable "Developer mode" (top right toggle)              │
│  3. Click "Load unpacked"                                   │
│  4. Select: ${extensionPath.padEnd(45)}│
│                                                             │
│  Then click the Lumi icon → Options to add your project.    │
└─────────────────────────────────────────────────────────────┘
`);

    console.log('   🌐 Server starting on http://127.0.0.1:3456');
    console.log('   💡 Press Ctrl+C to stop the server\n');

    // Start server in foreground so user sees output
    const serverDir = join(projectDir, 'server');
    const child = spawn('npm', ['run', 'dev'], {
        cwd: serverDir,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });

    // Handle clean exit
    process.on('SIGINT', () => {
        child.kill('SIGINT');
        process.exit(0);
    });

    // Wait for process
    return new Promise((resolve, reject) => {
        child.on('exit', (code) => {
            if (code === 0 || code === null) resolve();
            else reject(new Error(`Server exited with code ${code}`));
        });
    });
}

/**
 * Print the Lumi banner
 */
export function printBanner() {
    console.log(`
  ✨ L U M I ✨
  
  Visual Prompt Layer for Coding Agents
`);
}

/**
 * Print next steps after setup
 */
export function printNextSteps(projectDir, dirName, serverSkipped = false) {
    const extensionPath = join(projectDir, 'extension');

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                  ✅ Setup Complete!                       ║
╚═══════════════════════════════════════════════════════════╝

📋 Next Steps:

1. Load the Chrome extension:
   • Open chrome://extensions in Chrome
   • Enable "Developer mode" (top right)
   • Click "Load unpacked"
   • Select: ${extensionPath}

2. Configure your project:
   • Click the Lumi icon → Options
   • Add your project directory and dev server URL
   • Example: "/path/to/your/app" + "localhost:3000"
${serverSkipped ? `
3. Start the server:
   cd ${dirName !== '.' ? dirName : projectDir}
   npm run dev
` : ''}
📚 Documentation: https://github.com/heyzgj/lumi

Happy building! ❤️
`);
}

/**
 * Print error message
 */
export function printError(message) {
    console.error(`
❌ Error: ${message}

For help, run: npx create-lumi --help
Or visit: https://github.com/heyzgj/lumi/issues
`);
}

/**
 * Run a command and return a promise
 */
function runCommand(cmd, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            stdio: 'pipe',
            shell: process.platform === 'win32'
        });

        let stderr = '';
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (err) => {
            reject(new Error(`Failed to run ${cmd}: ${err.message}`));
        });

        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}\n${stderr}`));
            }
        });
    });
}

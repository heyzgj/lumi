#!/usr/bin/env node

/**
 * create-lumi CLI
 * One-command setup for Lumi - Visual Prompt Layer for Coding Agents
 */

import { existsSync } from 'fs';
import { resolve, basename } from 'path';
import { cloneRepo, installDeps, generateConfig, buildExtension, startServer, printBanner, printNextSteps, printError } from '../lib/actions.js';

const VERSION = '0.1.0';
const HELP_TEXT = `
create-lumi - Create a new Lumi project

Usage:
  npx create-lumi [directory]         Create in specified directory
  npx create-lumi                     Create in current directory
  npx create-lumi --help              Show this help message
  npx create-lumi --version           Show version

Options:
  --no-install    Skip dependency installation
  --no-build      Skip extension build
  --no-server     Don't start the dev server after setup

Examples:
  npx create-lumi                     # Setup in current directory
  npx create-lumi my-lumi-project     # Create in new directory
  npx create-lumi . --no-server       # Setup without starting server
`;

async function main() {
    const args = process.argv.slice(2);

    // Handle flags
    if (args.includes('--help') || args.includes('-h')) {
        console.log(HELP_TEXT);
        process.exit(0);
    }

    if (args.includes('--version') || args.includes('-v')) {
        console.log(`create-lumi v${VERSION}`);
        process.exit(0);
    }

    const skipInstall = args.includes('--no-install');
    const skipBuild = args.includes('--no-build');
    const skipServer = args.includes('--no-server');

    // Get target directory (filter out flags)
    const positionalArgs = args.filter(arg => !arg.startsWith('--'));
    const targetDir = positionalArgs[0] || '.';
    const absoluteTarget = resolve(process.cwd(), targetDir);
    const dirName = basename(absoluteTarget);

    printBanner();

    console.log(`\n📁 Target directory: ${absoluteTarget}\n`);

    // Check if directory exists and has content
    if (targetDir !== '.' && existsSync(absoluteTarget)) {
        printError(`Directory "${targetDir}" already exists. Please choose a different name or delete it first.`);
        process.exit(1);
    }

    try {
        // Step 1: Clone repository
        console.log('📥 Cloning Lumi repository...');
        await cloneRepo(absoluteTarget, targetDir === '.');
        console.log('   ✅ Repository cloned\n');

        // Step 2: Install dependencies
        if (!skipInstall) {
            console.log('📦 Installing dependencies...');
            await installDeps(absoluteTarget);
            console.log('   ✅ Dependencies installed\n');
        }

        // Step 3: Generate config
        console.log('⚙️  Generating configuration...');
        await generateConfig(absoluteTarget);
        console.log('   ✅ Configuration created\n');

        // Step 4: Build extension
        if (!skipBuild && !skipInstall) {
            console.log('🔨 Building Chrome extension...');
            await buildExtension(absoluteTarget);
            console.log('   ✅ Extension built\n');
        }

        // Step 5: Start server (optional)
        if (!skipServer && !skipInstall) {
            console.log('🚀 Starting development server...');
            await startServer(absoluteTarget);
        }

        // Print next steps
        printNextSteps(absoluteTarget, dirName, skipServer);

    } catch (error) {
        printError(error.message);
        process.exit(1);
    }
}

main();

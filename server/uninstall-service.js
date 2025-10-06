#!/usr/bin/env node

/**
 * LUMI Server - Service Uninstaller
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const platform = process.platform;

console.log('LUMI Server Service Uninstaller');
console.log('================================');
console.log('');

if (platform === 'darwin') {
  uninstallMacOS();
} else if (platform === 'linux') {
  uninstallLinux();
} else if (platform === 'win32') {
  uninstallWindows();
}

function uninstallMacOS() {
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.lumi.server.plist');
  
  try {
    // Stop the service
    try {
      execSync('launchctl stop com.lumi.server', { stdio: 'inherit' });
      console.log('✅ Service stopped');
    } catch (error) {
      console.log('ℹ️  Service not running');
    }

    // Unload the service
    try {
      execSync(`launchctl unload ${plistPath}`, { stdio: 'inherit' });
      console.log('✅ Service unloaded');
    } catch (error) {
      console.log('ℹ️  Service not loaded');
    }

    // Delete plist file
    if (fs.existsSync(plistPath)) {
      fs.unlinkSync(plistPath);
      console.log('✅ Deleted service file');
    }

    console.log('');
    console.log('✅ Uninstallation complete!');

  } catch (error) {
    console.error('❌ Uninstallation failed:', error.message);
  }
}

function uninstallLinux() {
  const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'lumi-server.service');
  
  try {
    // Stop the service
    execSync('systemctl --user stop lumi-server.service', { stdio: 'inherit' });
    console.log('✅ Service stopped');

    // Disable the service
    execSync('systemctl --user disable lumi-server.service', { stdio: 'inherit' });
    console.log('✅ Service disabled');

    // Delete service file
    if (fs.existsSync(servicePath)) {
      fs.unlinkSync(servicePath);
      console.log('✅ Deleted service file');
    }

    // Reload systemd
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
    console.log('✅ Reloaded systemd');

    console.log('');
    console.log('✅ Uninstallation complete!');

  } catch (error) {
    console.error('❌ Uninstallation failed:', error.message);
  }
}

function uninstallWindows() {
  console.log('Windows uninstallation:');
  console.log('  1. Remove shortcut from startup folder');
  console.log('  2. Or run: nssm remove LumiServer confirm');
}


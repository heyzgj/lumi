#!/usr/bin/env node

/**
 * LUMI Server - Service Installer
 * Auto-start the server on system boot
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const platform = process.platform;
const serverPath = path.join(__dirname, 'server.js');
const nodePath = process.execPath;

console.log('LUMI Server Service Installer');
console.log('=============================');
console.log('Platform:', platform);
console.log('Node.js:', nodePath);
console.log('Server:', serverPath);
console.log('');

if (platform === 'darwin') {
  installMacOS();
} else if (platform === 'linux') {
  installLinux();
} else if (platform === 'win32') {
  installWindows();
} else {
  console.error('❌ Unsupported platform:', platform);
  process.exit(1);
}

/**
 * macOS (launchd)
 */
function installMacOS() {
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.lumi.server.plist');
  
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lumi.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${serverPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${os.homedir()}/.lumi/server-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${os.homedir()}/.lumi/server-stderr.log</string>
    <key>WorkingDirectory</key>
    <string>${__dirname}</string>
</dict>
</plist>`;

  try {
    // Create LaunchAgents directory if it doesn't exist
    const launchAgentsDir = path.dirname(plistPath);
    if (!fs.existsSync(launchAgentsDir)) {
      fs.mkdirSync(launchAgentsDir, { recursive: true });
    }

    // Write plist file
    fs.writeFileSync(plistPath, plist);
    console.log('✅ Created launchd plist:', plistPath);

    // Load the service
    try {
      execSync(`launchctl load ${plistPath}`, { stdio: 'inherit' });
      console.log('✅ Service loaded');
    } catch (error) {
      console.log('ℹ️  Service load failed (may already be loaded)');
    }

    // Start the service
    try {
      execSync('launchctl start com.lumi.server', { stdio: 'inherit' });
      console.log('✅ Service started');
    } catch (error) {
      console.log('ℹ️  Service start failed (may already be running)');
    }

    console.log('');
    console.log('✅ Installation complete!');
    console.log('');
    console.log('The server will now start automatically on system boot.');
    console.log('');
    console.log('Useful commands:');
    console.log('  Start:   launchctl start com.lumi.server');
    console.log('  Stop:    launchctl stop com.lumi.server');
    console.log('  Status:  launchctl list | grep lumi');
    console.log('  Logs:    tail -f ~/.lumi/server.log');
    console.log('');
    console.log('To uninstall: npm run uninstall-service');

  } catch (error) {
    console.error('❌ Installation failed:', error.message);
    process.exit(1);
  }
}

/**
 * Linux (systemd)
 */
function installLinux() {
  const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'lumi-server.service');
  
  const service = `[Unit]
Description=LUMI Server
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${serverPath}
Restart=always
RestartSec=10
WorkingDirectory=${__dirname}
StandardOutput=append:${os.homedir()}/.lumi/server-stdout.log
StandardError=append:${os.homedir()}/.lumi/server-stderr.log

[Install]
WantedBy=default.target
`;

  try {
    // Create systemd user directory if it doesn't exist
    const systemdDir = path.dirname(servicePath);
    if (!fs.existsSync(systemdDir)) {
      fs.mkdirSync(systemdDir, { recursive: true });
    }

    // Write service file
    fs.writeFileSync(servicePath, service);
    console.log('✅ Created systemd service:', servicePath);

    // Reload systemd
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
    console.log('✅ Reloaded systemd');

    // Enable the service
    execSync('systemctl --user enable lumi-server.service', { stdio: 'inherit' });
    console.log('✅ Service enabled');

    // Start the service
    execSync('systemctl --user start lumi-server.service', { stdio: 'inherit' });
    console.log('✅ Service started');

    console.log('');
    console.log('✅ Installation complete!');
    console.log('');
    console.log('Useful commands:');
    console.log('  Start:   systemctl --user start lumi-server');
    console.log('  Stop:    systemctl --user stop lumi-server');
    console.log('  Status:  systemctl --user status lumi-server');
    console.log('  Logs:    journalctl --user -u lumi-server -f');
    console.log('');
    console.log('To uninstall: npm run uninstall-service');

  } catch (error) {
    console.error('❌ Installation failed:', error.message);
    console.error('');
    console.error('You may need to enable lingering for your user:');
    console.error('  sudo loginctl enable-linger $USER');
    process.exit(1);
  }
}

/**
 * Windows (Task Scheduler)
 */
function installWindows() {
  console.log('Windows installation:');
  console.log('');
  console.log('Option 1: Manual (recommended)');
  console.log('  1. Press Win+R, type: shell:startup');
  console.log('  2. Create shortcut to: node "' + serverPath + '"');
  console.log('');
  console.log('Option 2: NSSM (advanced)');
  console.log('  1. Download NSSM: https://nssm.cc/download');
  console.log('  2. Run: nssm install LumiServer "' + nodePath + '" "' + serverPath + '"');
  console.log('  3. Run: nssm start LumiServer');
  console.log('');
  console.log('The server will start automatically on system boot.');
}


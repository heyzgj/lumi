#!/usr/bin/env node

/**
 * LUMI Local Server
 * HTTP bridge between Chrome extension and local AI CLIs (Codex/Claude)
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Configuration
const PORT = process.env.LUMI_PORT || 3456;
const CONFIG_DIR = path.join(os.homedir(), '.lumi');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const CLI_CACHE_PATH = path.join(CONFIG_DIR, 'cli-capabilities.json');
const LOG_PATH = path.join(CONFIG_DIR, 'server.log');
const DEV_MODE = process.argv.includes('--dev');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Load configuration
let config = {
  workingDirectory: process.cwd(),
  codexModel: 'gpt-5-codex',
  codexApprovals: 'read-only',
  codexDisableNetwork: true,
  claudeOutputFormat: 'json',
  claudeTools: ['TextEditor', 'Read']
};

try {
  if (fs.existsSync(CONFIG_PATH)) {
    const userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    config = { ...config, ...userConfig };
  }
} catch (error) {
  logError('Failed to load config:', error.message);
}

// CLI capabilities cache
let cliCapabilities = {};
try {
  if (fs.existsSync(CLI_CACHE_PATH)) {
    cliCapabilities = JSON.parse(fs.readFileSync(CLI_CACHE_PATH, 'utf8'));
  }
} catch (error) {
  logError('Failed to load CLI capabilities cache:', error.message);
}

// Logging
function log(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.join(' ')}\n`;
  
  if (DEV_MODE) {
    console.log(...args);
  }
  
  try {
    fs.appendFileSync(LOG_PATH, message);
  } catch (error) {
    // Ignore log write errors
  }
}

function logError(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ERROR: ${args.join(' ')}\n`;
  
  console.error(...args);
  
  try {
    fs.appendFileSync(LOG_PATH, message);
  } catch (error) {
    // Ignore log write errors
  }
}

// Express app
const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  log(`${req.method} ${req.path} from ${req.ip}`);
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    config: {
      workingDirectory: config.workingDirectory,
      cliCapabilities
    }
  });
});

/**
 * CLI capabilities endpoint
 */
app.get('/capabilities', (req, res) => {
  res.json({
    cliCapabilities,
    config: {
      codexModel: config.codexModel,
      claudeOutputFormat: config.claudeOutputFormat
    }
  });
});

/**
 * Execute AI CLI endpoint
 */
app.post('/execute', async (req, res) => {
  const startTime = Date.now();
  const { engine, context } = req.body;

  log(`Execute request: engine=${engine}, intent="${context?.intent?.slice(0, 50)}..."`);

  if (!context || !context.intent) {
    return res.status(400).json({
      error: 'Invalid request: missing intent'
    });
  }

  try {
    // Save screenshot if provided
    let screenshotPath = null;
    if (context.screenshot) {
      const requestId = `req_${Date.now()}`;
      screenshotPath = await saveScreenshot(context.screenshot, requestId);
    }

    // Execute based on engine
    let result;
    if (engine === 'claude') {
      result = await executeClaude(context, screenshotPath);
    } else {
      // Default to Codex
      result = await executeCodex(context, screenshotPath);
    }

    const duration = Date.now() - startTime;
    log(`Execute completed in ${duration}ms: ${result.success ? 'success' : 'error'}`);

    // With -a never --sandbox workspace-write, Codex directly modifies files
    // No need to manually apply diffs - files are already changed
    res.json({
      ...result,
      filesModified: result.success, // True if Codex ran successfully
      duration,
      timestamp: Date.now()
    });

  } catch (error) {
    logError('Execute error:', error.message);
    res.status(500).json({
      error: error.message,
      timestamp: Date.now()
    });
  }
});

/**
 * Run shell command safely
 */
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      shell: false,
      timeout: options.timeout || 60000,
      cwd: options.cwd || config.workingDirectory,
      stdio: options.stdin ? ['pipe', 'pipe', 'pipe'] : undefined,
      ...options
    });

    let stdout = '';
    let stderr = '';

    // If stdin data provided, write it and close
    if (options.stdin) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    }

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      // Live log (truncated lines)
      try { log(`[stdout] ${chunk.slice(0, 2000)}`); } catch (_) {}
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      try { log(`[stderr] ${chunk.slice(0, 2000)}`); } catch (_) {}
    });

    proc.on('error', (error) => {
      resolve({
        exitCode: -1,
        stdout: '',
        stderr: error.message,
        error: error.message
      });
    });

    proc.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode || 0,
        stdout,
        stderr
      });
    });
  });
}

// NOTE: extractUnifiedDiff and applyUnifiedDiff functions removed
// Codex with --sandbox workspace-write directly modifies files - no manual diff application needed

/**
 * Detect CLI capabilities
 */
async function detectCLI(cliName) {
  const cached = cliCapabilities[cliName];
  if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
    return cached;
  }

  const capabilities = {
    name: cliName,
    available: false,
    version: null,
    supportsImage: false,
    supportsOutputFormat: false,
    timestamp: Date.now()
  };

  try {
    const versionResult = await runCommand(cliName, ['--version'], { timeout: 5000 });
    if (versionResult.exitCode === 0) {
      capabilities.available = true;
      capabilities.version = versionResult.stdout.trim().split('\n')[0];
    }

    const helpResult = await runCommand(cliName, ['--help'], { timeout: 5000 });
    if (helpResult.exitCode === 0) {
      const helpText = helpResult.stdout + helpResult.stderr;
      
      if (cliName === 'codex') {
        capabilities.supportsImage = helpText.includes('-i') || helpText.includes('--image');
        capabilities.supportsModel = helpText.includes('--model');
        capabilities.supportsSandbox = helpText.includes('--sandbox');
        capabilities.supportsFullAuto = helpText.includes('--full-auto');
      } else if (cliName === 'claude') {
        capabilities.supportsOutputFormat = helpText.includes('--output-format');
        capabilities.supportsPrompt = helpText.includes('-p');
      }
    }
  } catch (error) {
    logError(`CLI detection failed for ${cliName}:`, error.message);
  }

  cliCapabilities[cliName] = capabilities;
  try {
    fs.writeFileSync(CLI_CACHE_PATH, JSON.stringify(cliCapabilities, null, 2));
  } catch (error) {
    logError('Failed to save CLI capabilities cache:', error.message);
  }

  return capabilities;
}

/**
 * Build AI prompt from context
 */
function buildPrompt(context) {
  let prompt = `# Task\n${context.intent}\n\n`;

  prompt += `# Context\n`;
  prompt += `- Page: ${context.pageUrl}\n`;
  prompt += `- Title: ${context.pageTitle}\n`;
  prompt += `- Selection Mode: ${context.selectionMode}\n`;

  if (context.selectionMode === 'element') {
    // Multi-element support
    if (Array.isArray(context.elements) && context.elements.length > 0) {
      prompt += `\n## Selected Elements (${context.elements.length})\n`;
      context.elements.forEach((el, idx) => {
        prompt += `\n### Element ${idx + 1}\n`;
        prompt += `- Tag: ${el.tagName}\n`;
        prompt += `- Selector: ${el.selector}\n`;
        if (el.className) prompt += `- Class: ${el.className}\n`;
        if (el.id) prompt += `- ID: ${el.id}\n`;
        if (el.outerHTML) {
          prompt += `\nHTML\n\`\`\`html\n${String(el.outerHTML).slice(0, 1000)}\n\`\`\`\n`;
        }
        if (el.computedStyle) {
          prompt += `\nComputed Styles\n\`\`\`json\n${JSON.stringify(el.computedStyle, null, 2)}\n\`\`\`\n`;
        }
        if (el.bbox) {
          prompt += `- BBox: (${Math.round(el.bbox.left)}, ${Math.round(el.bbox.top)}) ${Math.round(el.bbox.width)}×${Math.round(el.bbox.height)}\n`;
        }
      });
    } else if (context.element) {
      // Single element (legacy)
      prompt += `\n## Selected Element\n`;
      prompt += `- Tag: ${context.element.tagName}\n`;
      prompt += `- Selector: ${context.element.selector}\n`;
      if (context.element.className) {
        prompt += `- Class: ${context.element.className}\n`;
      }
      if (context.element.id) {
        prompt += `- ID: ${context.element.id}\n`;
      }
      prompt += `\n### HTML\n\`\`\`html\n${context.element.outerHTML.slice(0, 1000)}\n\`\`\`\n`;
      prompt += `\n### Computed Styles\n\`\`\`json\n${JSON.stringify(context.element.computedStyle, null, 2)}\n\`\`\`\n`;
    }
  }

  if (context.bbox) {
    prompt += `\n## Selection Area\n`;
    prompt += `- Position: (${Math.round(context.bbox.left)}, ${Math.round(context.bbox.top)})\n`;
    prompt += `- Size: ${Math.round(context.bbox.width)} × ${Math.round(context.bbox.height)}px\n`;
  }

  prompt += `\n# Instructions\n`;
  prompt += `- Modify files directly to implement the requested changes\n`;
  prompt += `- Focus only on the selected element and related code\n`;
  prompt += `- Keep changes minimal - don't modify unrelated code\n`;
  prompt += `- Maintain code quality and accessibility\n`;

  return prompt;
}

/**
 * Save screenshot to temp file
 */
async function saveScreenshot(dataUrl, requestId) {
  if (!dataUrl) return null;

  try {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const tempPath = path.join(CONFIG_DIR, `screenshot_${requestId}.png`);
    fs.writeFileSync(tempPath, buffer);
    
    const stats = fs.statSync(tempPath);
    if (stats.size > 1024 * 1024) {
      log('Warning: Screenshot exceeds 1MB');
    }

    return tempPath;
  } catch (error) {
    logError('Failed to save screenshot:', error.message);
    return null;
  }
}

/**
 * Execute Codex CLI
 */
async function executeCodex(context, screenshotPath) {
  const capabilities = await detectCLI('codex');
  
  if (!capabilities.available) {
    return {
      error: 'Codex CLI not available',
      message: 'Please install Codex CLI or check your PATH'
    };
  }

  const prompt = buildPrompt(context);
  const args = [];

  // Global options (before 'exec' subcommand)
  // Approval policy (important for non-interactive execution)
  // ALWAYS use -a never (not --full-auto) so we can pass prompt as CLI arg
  args.push('-a', 'never');

  // Subcommand
  args.push('exec');

  // Exec-specific options
  if (capabilities.supportsModel) {
    const model = config.codexModel || 'gpt-5-codex';
    args.push('--model', model);
  }

  // Sandbox mode for write permissions
  if (capabilities.supportsSandbox) {
    const sandbox = config.codexSandbox || 'workspace-write';
    args.push('--sandbox', sandbox);
  }

  if (capabilities.supportsImage && screenshotPath) {
    args.push('-i', screenshotPath);
  }

  // When using -i (image), Codex expects prompt from stdin, NOT as CLI arg
  // So we DON'T push prompt to args, we pass it via stdin option
  const useStdin = !!(capabilities.supportsImage && screenshotPath);
  
  if (!useStdin) {
    args.push(prompt);
  }

  // Log full command (hide prompt content for brevity)
  const cmdPreview = args.join(' ') + (useStdin ? ' <prompt-from-stdin>' : ' <prompt>');
  log('Executing Codex:', cmdPreview);
  log('Using stdin for prompt:', useStdin);
  log('--- Codex started ---');
  log('Working directory:', config.workingDirectory);

  const result = await runCommand('codex', args, {
    timeout: 3600000, // 60 minutes
    cwd: config.workingDirectory,
    stdin: useStdin ? prompt : null
  });

  // Clean up screenshot
  if (screenshotPath) {
    try {
      fs.unlinkSync(screenshotPath);
    } catch (error) {
      logError('Failed to delete screenshot:', error.message);
    }
  }

  if (result.exitCode !== 0) {
    return {
      error: 'Codex execution failed',
      message: result.stderr || result.stdout,
      exitCode: result.exitCode
    };
  }

  return {
    success: true,
    output: result.stdout,
    stderr: result.stderr,
    engine: 'codex'
  };
}

/**
 * Execute Claude CLI
 */
async function executeClaude(context, screenshotPath) {
  const capabilities = await detectCLI('claude');
  
  if (!capabilities.available) {
    return {
      error: 'Claude CLI not available',
      message: 'Please install Claude Code CLI or check your PATH'
    };
  }

  const prompt = buildPrompt(context);
  const args = [];

  if (capabilities.supportsPrompt) {
    args.push('-p', prompt);
  } else {
    args.push(prompt);
  }

  if (capabilities.supportsOutputFormat) {
    args.push('--output-format', 'json');
  }

  log('Executing Claude:', 'claude', args.slice(0, 2).join(' '), '...');

  const result = await runCommand('claude', args, {
    timeout: 3600000, // 60 minutes
    cwd: config.workingDirectory
  });

  // Clean up screenshot
  if (screenshotPath) {
    try {
      fs.unlinkSync(screenshotPath);
    } catch (error) {
      logError('Failed to delete screenshot:', error.message);
    }
  }

  if (result.exitCode !== 0) {
    return {
      error: 'Claude execution failed',
      message: result.stderr || result.stdout,
      exitCode: result.exitCode
    };
  }

  let output = result.stdout;
  if (capabilities.supportsOutputFormat) {
    try {
      output = JSON.parse(result.stdout);
    } catch (error) {
      // Keep as string if parse fails
    }
  }

  return {
    success: true,
    output,
    stderr: result.stderr,
    engine: 'claude'
  };
}

/**
 * Start server
 */
async function startServer() {
  log('='.repeat(50));
  log('LUMI Server Starting...');
  log('Version: 1.0.0');
  log('Node.js:', process.version);
  log('Platform:', process.platform);
  log('Config directory:', CONFIG_DIR);
  log('Working directory:', config.workingDirectory);
  log('Dev mode:', DEV_MODE);
  log('='.repeat(50));

  // Detect CLIs on startup
  log('Detecting CLIs...');
  await detectCLI('codex');
  await detectCLI('claude');
  log('CLI capabilities:', JSON.stringify(cliCapabilities, null, 2));

  // Start HTTP server
  const server = app.listen(PORT, '127.0.0.1', () => {
    log(`✅ Server running at http://127.0.0.1:${PORT}`);
    log('Ready to accept requests from Chrome extension');
    log('Press Ctrl+C to stop');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('Received SIGINT, shutting down gracefully...');
    server.close(() => {
      log('Server stopped');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
      log('Server stopped');
      process.exit(0);
    });
  });

  // Error handling
  process.on('uncaughtException', (error) => {
    logError('Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled rejection at:', promise, 'reason:', reason);
  });
}

// Start the server
startServer().catch((error) => {
  logError('Failed to start server:', error);
  process.exit(1);
});

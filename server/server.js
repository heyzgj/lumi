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

// ---------------------------------------------------------------------------
// Configuration bootstrap
// ---------------------------------------------------------------------------

const PORT = process.env.LUMI_PORT || 3456;
const DEV_MODE = process.argv.includes('--dev');

const defaultConfig = {
  workingDirectory: process.cwd(),
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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function resolveConfigDirectory() {
  if (process.env.LUMI_CONFIG_DIR) {
    return path.resolve(process.env.LUMI_CONFIG_DIR);
  }

  const markerCandidates = [
    path.resolve('.lumi-location'),
    path.resolve('..', '.lumi-location'),
    path.resolve(process.cwd(), '..', '..', '.lumi-location')
  ];

  for (const candidate of markerCandidates) {
    if (fs.existsSync(candidate)) {
      const data = readJson(candidate);
      if (data?.configDir) {
        return path.resolve(data.configDir);
      }
    }
  }

  return path.join(os.homedir(), '.lumi');
}

function normalizeConfig(raw = {}) {
  const merged = {
    ...defaultConfig,
    ...raw,
    codex: {
      ...defaultConfig.codex,
      ...(raw.codex || {})
    },
    claude: {
      ...defaultConfig.claude,
      ...(raw.claude || {})
    }
  };

  // Legacy keys support
  if (raw.codexModel) merged.codex.model = raw.codexModel;
  if (raw.codexApprovals) merged.codex.approvals = raw.codexApprovals;
  if (raw.codexSandbox) merged.codex.sandbox = raw.codexSandbox;
  if (raw.codexExtraArgs) merged.codex.extraArgs = raw.codexExtraArgs;

  if (raw.claudeModel) merged.claude.model = raw.claudeModel;
  if (raw.claudeTools) merged.claude.tools = raw.claudeTools;
  if (raw.claudeOutputFormat) merged.claude.outputFormat = raw.claudeOutputFormat;
  if (raw.claudePermissionMode) merged.claude.permissionMode = raw.claudePermissionMode;
  if (raw.claudeExtraArgs) merged.claude.extraArgs = raw.claudeExtraArgs;

  merged.projects = sanitizeProjects(raw.projects ?? merged.projects);

  return merged;
}

function mergeConfig(current, updates = {}) {
  const candidate = {
    ...current,
    ...updates,
    codex: {
      ...current.codex,
      ...(updates.codex || {})
    },
    claude: {
      ...current.claude,
      ...(updates.claude || {})
    },
    projects: updates.projects !== undefined ? updates.projects : current.projects
  };
  return normalizeConfig(candidate);
}

function sanitizeProjects(projects) {
  if (!Array.isArray(projects)) return [];

  return projects
    .map((project, index) => {
      if (!project || typeof project !== 'object') return null;
      const id = typeof project.id === 'string' && project.id.trim().length
        ? project.id.trim()
        : `project-${index + 1}`;
      const name = typeof project.name === 'string' ? project.name.trim() : '';
      const workingDirectory = typeof project.workingDirectory === 'string'
        ? project.workingDirectory.trim()
        : '';
      const hosts = Array.isArray(project.hosts)
        ? project.hosts.map((host) => normalizeHostPattern(String(host))).filter(Boolean)
        : [];
      const enabled = project.enabled !== false;

      if (!workingDirectory || hosts.length === 0) {
        return null;
      }

      return {
        id,
        name,
        workingDirectory,
        hosts,
        enabled,
        note: typeof project.note === 'string' ? project.note : undefined
      };
    })
    .filter(Boolean);
}

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const CONFIG_DIR = resolveConfigDirectory();
ensureDirectory(CONFIG_DIR);
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const CLI_CACHE_PATH = path.join(CONFIG_DIR, 'cli-capabilities.json');
const LOG_PATH = path.join(CONFIG_DIR, 'server.log');

let config = defaultConfig;
let cliCapabilities = {};

try {
  if (fs.existsSync(CONFIG_PATH)) {
    const rawConfig = readJson(CONFIG_PATH);
    if (rawConfig) {
      config = normalizeConfig(rawConfig);
    }
  } else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
  }
} catch (error) {
  console.error('[LUMI][Config] Failed to load config:', error.message);
}

try {
  if (fs.existsSync(CLI_CACHE_PATH)) {
    const cached = readJson(CLI_CACHE_PATH);
    if (cached) cliCapabilities = cached;
  }
} catch (error) {
  console.error('[LUMI][Config] Failed to load CLI cache:', error.message);
}

function persistConfig(nextConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
  } catch (error) {
    console.error('[LUMI][Config] Failed to persist config:', error.message);
  }
}

function publicConfig() {
  return {
    workingDirectory: config.workingDirectory,
    defaultEngine: config.defaultEngine,
    codex: config.codex,
    claude: config.claude,
    projects: config.projects
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hostMatches(pattern, host) {
  if (!pattern || !host) return false;
  const normalizedPattern = normalizeHostPattern(pattern).toLowerCase();
  const normalizedHost = host.trim().toLowerCase();

  if (!normalizedPattern.includes('*')) {
    return normalizedPattern === normalizedHost;
  }

  const regex = new RegExp('^' + normalizedPattern.split('*').map(escapeRegex).join('.*') + '$');
  return regex.test(normalizedHost);
}

function resolveProjectForUrl(pageUrl) {
  if (!pageUrl) {
    return { project: null, cwd: config.workingDirectory };
  }

  let parsed;
  try {
    parsed = new URL(pageUrl);
  } catch (error) {
    return { project: null, cwd: config.workingDirectory };
  }

  const host = parsed.host;
  const projects = Array.isArray(config.projects) ? config.projects : [];

  for (const project of projects) {
    if (!project || project.enabled === false) continue;
    const hosts = Array.isArray(project.hosts) ? project.hosts : [];
    if (hosts.length === 0) continue;
    const matched = hosts.some((pattern) => hostMatches(pattern, host));
    if (!matched) continue;

    const cwd = project.workingDirectory || config.workingDirectory;
    if (!cwd) continue;

    return { project, cwd };
  }

  return { project: null, cwd: config.workingDirectory };
}

function normalizeHostPattern(value) {
  if (!value) return '';
  let pattern = value.trim().toLowerCase();
  if (!pattern) return '';

  if (pattern.startsWith('http://')) {
    pattern = pattern.slice(7);
  } else if (pattern.startsWith('https://')) {
    pattern = pattern.slice(8);
  }

  if (pattern.startsWith('//')) {
    pattern = pattern.slice(2);
  }

  // Remove trailing slash but keep port if present
  if (pattern.endsWith('/')) {
    pattern = pattern.replace(/\/+$/, '');
  }

  return pattern;
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  log(`${req.method} ${req.path} from ${req.ip}`);
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.1.0',
    uptime: process.uptime(),
    config: {
      workingDirectory: config.workingDirectory,
      cliCapabilities,
      codex: config.codex,
      claude: config.claude
    }
  });
});

app.get('/capabilities', (req, res) => {
  res.json({
    cliCapabilities,
    config: publicConfig()
  });
});

app.post('/config', (req, res) => {
  try {
    const updates = req.body || {};
    const next = mergeConfig(config, updates);
    config = next;
    persistConfig(config);
    res.json({ success: true, config: publicConfig() });
  } catch (error) {
    logError('Failed to update config:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/execute', async (req, res) => {
  const startTime = Date.now();
  const { engine, context } = req.body;

  log(`Execute request: engine=${engine}, intent="${context?.intent?.slice(0, 50)}..."`);

  const elementsCount = Array.isArray(context?.elements)
    ? context.elements.length
    : context?.element ? 1 : 0;
  log(`Context contains ${elementsCount} selected element(s)`);

  if (!context || !context.intent) {
    return res.status(400).json({ error: 'Invalid request: missing intent' });
  }

  try {
    const { project, cwd } = resolveProjectForUrl(context.pageUrl);
    const hasProjects = Array.isArray(config.projects) && config.projects.length > 0;

    if (hasProjects && !project) {
      const message = 'No configured project matches the current page. Update LUMI settings to map this host.';
      logError('Project match failed for URL:', context.pageUrl);
      return res.status(400).json({
        error: message,
        code: 'NO_PROJECT_MATCH',
        host: (() => {
          try {
            return new URL(context.pageUrl).host;
          } catch (_) {
            return null;
          }
        })(),
        projects: config.projects
      });
    }

    const workingDirectory = cwd || config.workingDirectory;
    log('Resolved working directory:', workingDirectory, 'project:', project?.name || 'default');

    let screenshotPath = null;
    if (context.screenshot) {
      const requestId = `req_${Date.now()}`;
      screenshotPath = await saveScreenshot(context.screenshot, requestId);
    }

    let result;
    if (engine === 'claude') {
      result = await executeClaude(context, screenshotPath, { cwd: workingDirectory, project });
    } else {
      result = await executeCodex(context, screenshotPath, { cwd: workingDirectory, project });
    }

    const duration = Date.now() - startTime;
    log(`Execute completed in ${duration}ms: ${result.success ? 'success' : 'error'}`);

    res.json({
      ...result,
      filesModified: result.success,
      duration,
      timestamp: Date.now(),
      project: project ? { id: project.id, name: project.name, workingDirectory } : null
    });
  } catch (error) {
    logError('Execute error:', error.message);
    res.status(500).json({ error: error.message, timestamp: Date.now() });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

    if (options.stdin) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    }

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      try { log(`[stdout] ${chunk.slice(0, 2000)}`); } catch (_) {}
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      try { log(`[stderr] ${chunk.slice(0, 2000)}`); } catch (_) {}
    });

    proc.on('error', (error) => {
      resolve({ exitCode: -1, stdout: '', stderr: error.message, error: error.message });
    });

    proc.on('close', (exitCode) => {
      resolve({ exitCode: exitCode || 0, stdout, stderr });
    });
  });
}

function parseArgs(str = '') {
  if (!str.trim()) return [];
  const result = [];
  const regex = /"([^"]*)"|[^\s"]+/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    result.push(match[1] !== undefined ? match[1] : match[0]);
  }
  return result;
}

async function saveScreenshot(dataUrl, requestId) {
  if (!dataUrl) return null;

  const value = typeof dataUrl === 'string'
    ? dataUrl
    : (typeof dataUrl === 'object' && typeof dataUrl.dataUrl === 'string'
      ? dataUrl.dataUrl
      : null);

  if (!value) {
    logError('Invalid screenshot payload, expected data URL string.');
    return null;
  }

  try {
    const base64Data = value.replace(/^data:image\/png;base64,/, '');
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

async function executeCodex(context, screenshotPath, execOptions = {}) {
  const capabilities = await detectCLI('codex');

  if (!capabilities.available) {
    return {
      error: 'Codex CLI not available',
      message: 'Please install Codex CLI or check your PATH'
    };
  }

  let prompt = buildPrompt(context);

  if (screenshotPath) {
    prompt += `\n\n# Screenshot Reference\n- Local Path: ${screenshotPath}\n- Please review the image when making the requested changes.`;
  }
  const args = [];

  const approval = config.codex.approvals || 'never';
  args.push('-a', approval);
  args.push('exec');

  if (capabilities.supportsModel && config.codex.model) {
    args.push('--model', config.codex.model);
  }

  if (capabilities.supportsSandbox && config.codex.sandbox) {
    args.push('--sandbox', config.codex.sandbox);
  }

  if (capabilities.supportsImage && screenshotPath) {
    args.push('-i', screenshotPath);
  }

  const extraArgs = parseArgs(config.codex.extraArgs);
  if (extraArgs.length) {
    args.push(...extraArgs);
  }

  const useStdin = !!(capabilities.supportsImage && screenshotPath);
  if (!useStdin) {
    args.push(prompt);
  }

  const cmdPreview = args.join(' ') + (useStdin ? ' <prompt-from-stdin>' : ' <prompt>');
  log('Executing Codex:', cmdPreview);
  log('Using stdin for prompt:', useStdin);
  log('--- Codex started ---');
  log('Working directory:', config.workingDirectory);

  const result = await runCommand('codex', args, {
    timeout: 3600000,
    cwd: execOptions.cwd || config.workingDirectory,
    stdin: useStdin ? prompt : null
  });

  if (screenshotPath) {
    try { fs.unlinkSync(screenshotPath); } catch (error) { logError('Failed to delete screenshot:', error.message); }
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

async function executeClaude(context, screenshotPath, execOptions = {}) {
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

  if (config.claude.model) {
    args.push('--model', config.claude.model);
  }

  if (capabilities.supportsOutputFormat && config.claude.outputFormat) {
    args.push('--output-format', config.claude.outputFormat);
  }

  if (config.claude.permissionMode) {
    args.push('--permission-mode', config.claude.permissionMode);
  }

  if (Array.isArray(config.claude.tools) && config.claude.tools.length) {
    args.push('--tools', config.claude.tools.join(','));
  }

  const extraArgs = parseArgs(config.claude.extraArgs);
  if (extraArgs.length) {
    args.push(...extraArgs);
  }

  log('Executing Claude:', 'claude', args.slice(0, 4).join(' '), '...');

  const result = await runCommand('claude', args, {
    timeout: 3600000,
    cwd: execOptions.cwd || config.workingDirectory
  });

  if (screenshotPath) {
    try { fs.unlinkSync(screenshotPath); } catch (error) { logError('Failed to delete screenshot:', error.message); }
  }

  if (result.exitCode !== 0) {
    return {
      error: 'Claude execution failed',
      message: result.stderr || result.stdout,
      exitCode: result.exitCode
    };
  }

  let output = result.stdout;
  if (capabilities.supportsOutputFormat && config.claude.outputFormat === 'json') {
    try {
      output = JSON.parse(result.stdout);
    } catch (error) {
      // keep as string if parse fails
    }
  }

  return {
    success: true,
    output,
    stderr: result.stderr,
    engine: 'claude'
  };
}

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
    supportsModel: false,
    supportsSandbox: false,
    supportsPrompt: false,
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

function buildPrompt(context) {
  let prompt = `# Task\n${context.intent}\n\n`;

  prompt += `# Context\n`;
  prompt += `- Page: ${context.pageUrl}\n`;
  prompt += `- Title: ${context.pageTitle}\n`;
  prompt += `- Selection Mode: ${context.selectionMode}\n`;

  if (context.selectionMode === 'element') {
    const summaries = summarizeElements(context);
    if (summaries.length > 0) {
      prompt += `\n## Context Summary\n`;
      summaries.forEach((summary, idx) => {
        prompt += `- Element ${idx + 1}: ${summary}\n`;
      });
    }
  }

  if (context.selectionMode === 'element') {
    if (Array.isArray(context.elements) && context.elements.length > 0) {
      prompt += `\n## Selected Elements (${context.elements.length})\n`;
      context.elements.forEach((el, idx) => {
        prompt += `\n### Element ${idx + 1}\n`;
        prompt += renderElementDetail(el);
      });
    } else if (context.element) {
      prompt += `\n## Selected Element\n`;
      prompt += renderElementDetail(context.element);
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
  prompt += `- Do not modify elements outside the listed selections\n`;

  return prompt;
}

function summarizeElements(context) {
  const items = [];
  const elements = Array.isArray(context.elements) ? context.elements : (context.element ? [context.element] : []);
  elements.forEach((el) => {
    if (!el) return;
    const selector = el.selector || el.tagName || 'element';
    const words = (el.textContent || el.text || '').trim().split(/\s+/).filter(Boolean);
    const textSummary = words.length > 0 ? words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '') : 'no text';
    items.push(`${selector} — text: "${textSummary}"`);
  });
  return items;
}

function renderElementDetail(el) {
  if (!el) return '';
  let output = '';
  output += `- Tag: ${el.tagName}\n`;
  output += `- Selector: ${el.selector}\n`;
  if (el.className) output += `- Class: ${el.className}\n`;
  if (el.id) output += `- ID: ${el.id}\n`;
  if (el.textContent) {
    const words = el.textContent.trim().split(/\s+/).filter(Boolean);
    const text = words.slice(0, 24).join(' ');
    output += `- Text: "${text}${words.length > 24 ? '…' : ''}"\n`;
  }
  if (el.outerHTML) {
    output += `\nHTML\n\`\`\`html\n${String(el.outerHTML).slice(0, 800)}\n\`\`\`\n`;
  }
  if (el.computedStyle) {
    const styleSubset = pickStyles(el.computedStyle);
    output += `\nStyles\n\`\`\`json\n${JSON.stringify(styleSubset, null, 2)}\n\`\`\`\n`;
  }
  if (el.bbox) {
    output += `- BBox: (${Math.round(el.bbox.left)}, ${Math.round(el.bbox.top)}) ${Math.round(el.bbox.width)}×${Math.round(el.bbox.height)}\n`;
  }
  return output;
}

function pickStyles(style = {}) {
  const keys = [
    'display', 'position', 'top', 'left', 'width', 'height',
    'backgroundColor', 'color', 'fontSize', 'fontFamily', 'fontWeight',
    'lineHeight', 'padding', 'margin', 'border', 'borderRadius'
  ];
  return keys.reduce((acc, key) => {
    if (style[key] !== undefined) acc[key] = style[key];
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function startServer() {
  log('='.repeat(50));
  log('LUMI Server Starting...');
  log('Version: 1.1.0');
  log('Node.js:', process.version);
  log('Platform:', process.platform);
  log('Config directory:', CONFIG_DIR);
  log('Working directory:', config.workingDirectory);
  log('Dev mode:', DEV_MODE);
  log('='.repeat(50));

  log('Detecting CLIs...');
  await detectCLI('codex');
  await detectCLI('claude');
  log('CLI capabilities:', JSON.stringify(cliCapabilities, null, 2));

  const server = app.listen(PORT, '127.0.0.1', () => {
    log(`✅ Server running at http://127.0.0.1:${PORT}`);
    log('Ready to accept requests from Chrome extension');
    log('Press Ctrl+C to stop');
  });

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

  process.on('uncaughtException', (error) => {
    logError('Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled rejection at:', promise, 'reason:', reason);
  });
}

startServer().catch((error) => {
  logError('Failed to start server:', error);
  process.exit(1);
});

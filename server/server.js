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
  features: {
    useJsonTimeline: false
  },
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
    features: {
      ...defaultConfig.features,
      ...(raw.features || {})
    },
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
    features: {
      ...current.features,
      ...(updates.features || {})
    },
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

      if (!workingDirectory) {
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

async function resolveCLIName(primary, fallbacks = []) {
  const candidates = [primary, ...fallbacks];
  for (const name of candidates) {
    try {
      const res = await runCommand(name, ['--version'], { timeout: 3000 });
      if (res && res.exitCode === 0) return name;
    } catch (_) { }
  }
  return null;
}

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

  const host = parsed.host || '';
  const isFile = parsed.protocol === 'file:';
  const pathname = (parsed.pathname || '').toLowerCase();
  const projects = Array.isArray(config.projects) ? config.projects : [];

  // Choose the most specific matching project:
  // - Prefer explicit host patterns (exact > fewer wildcards > longer length)
  // - 对 file:// URL 支持路径前缀匹配（file:///path/... 或 /path/...）
  // - 如果 hosts 为空，将该 project 视为 wildcard，匹配任何 URL，优先级最低
  let best = null;
  let bestScore = -Infinity;

  for (const project of projects) {
    if (!project || project.enabled === false) continue;
    const hosts = Array.isArray(project.hosts) ? project.hosts : [];
    if (hosts.length === 0) {
      // Wildcard project: matches any URL with lowest priority
      const cwd = project.workingDirectory || config.workingDirectory;
      if (!cwd) continue;
      const score = -1; // less than any explicit match
      if (score > bestScore) {
        bestScore = score;
        best = { project, cwd };
      }
      continue;
    }
    for (const pattern of hosts) {
      const raw = String(pattern || '').trim().toLowerCase();
      if (!raw) continue;

      // file:// 页面支持路径前缀匹配
      if (isFile && (raw.startsWith('file:///') || raw.startsWith('/'))) {
        let prefix = raw;
        if (prefix.startsWith('file://')) {
          prefix = prefix.slice('file://'.length);
        }
        if (!pathname.startsWith(prefix)) continue;
        const cwd = project.workingDirectory || config.workingDirectory;
        if (!cwd) continue;
        // 更长的前缀代表更具体的匹配
        const score = 5000 + prefix.length;
        if (score > bestScore) {
          bestScore = score;
          best = { project, cwd };
        }
        continue;
      }

      // 其它协议按 host pattern 匹配
      if (!hostMatches(pattern, host)) continue;
      const normalized = normalizeHostPattern(pattern);
      const wildcards = (normalized.match(/\*/g) || []).length;
      const nonWildcardLen = normalized.replace(/\*/g, '').length;
      const exact = normalized === host.toLowerCase() ? 1 : 0;
      const score = exact * 10000 + nonWildcardLen - wildcards * 10;
      if (score > bestScore) {
        const cwd = project.workingDirectory || config.workingDirectory;
        if (!cwd) continue;
        bestScore = score;
        best = { project, cwd };
      }
    }
  }

  return best || { project: null, cwd: config.workingDirectory };
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
      claude: config.claude,
      features: config.features || {},
      projects: publicConfig().projects
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

// Prompt preview (no CLI execution) for validation
app.post('/preview', (req, res) => {
  try {
    const { context } = req.body || {};
    if (!context || !context.intent) {
      return res.status(400).json({ error: 'Missing context or context.intent' });
    }
    const prompt = buildPrompt(context);
    res.json({
      prompt,
      summary: {
        elements: Array.isArray(context.elements) ? context.elements.length : (context.element ? 1 : 0),
        screenshots: Array.isArray(context.screenshots) ? context.screenshots.length : 0
      }
    });
  } catch (error) {
    logError('Preview error:', error.message);
    res.status(500).json({ error: error.message });
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

app.post('/execute/stream', async (req, res) => {
  const startTime = Date.now();
  const { engine, context } = req.body || {};

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const writeEvent = (payload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      logError('Failed to write SSE payload:', error.message);
    }
  };
  const sendChunk = (chunk) => {
    if (!chunk) return;
    writeEvent({ type: 'chunk', chunk });
  };
  const sendError = (message) => {
    if (!message) return;
    writeEvent({ type: 'error', error: message });
  };
  const finish = (payload = {}) => {
    writeEvent({ type: 'done', ...payload });
    try { res.end(); } catch (_) { }
  };

  if (!context || !context.intent) {
    sendError('Invalid request: missing intent');
    finish({ success: false, error: 'Invalid request: missing intent', timestamp: Date.now() });
    return;
  }

  const { project, cwd } = resolveProjectForUrl(context.pageUrl);
  const hasProjects = Array.isArray(config.projects) && config.projects.length > 0;

  if (hasProjects && !project) {
    const message = 'No configured project matches the current page. Update LUMI settings to map this host.';
    logError('Project match failed for URL (stream):', context.pageUrl);
    sendError(message);
    finish({
      success: false,
      error: message,
      code: 'NO_PROJECT_MATCH',
      host: (() => {
        try {
          return new URL(context.pageUrl).host;
        } catch (_) {
          return null;
        }
      })(),
      projects: config.projects,
      timestamp: Date.now()
    });
    return;
  }

  const workingDirectory = cwd || config.workingDirectory;
  log('Resolved working directory (stream):', workingDirectory, 'project:', project?.name || 'default');

  let screenshotPath = null;
  let activeProc = null;
  req.on('close', () => {
    if (activeProc) {
      try { activeProc.kill('SIGKILL'); } catch (_) { }
    }
  });

  try {
    if (context.screenshot) {
      const requestId = `stream_${Date.now()}`;
      screenshotPath = await saveScreenshot(context.screenshot, requestId);
    }

    const execOptions = { cwd: workingDirectory, project };
    const streamOptions = {
      sendChunk,
      sendError,
      setProc: (proc) => { activeProc = proc; }
    };
    let result;
    if (engine === 'claude') {
      result = await streamClaude(context, screenshotPath, execOptions, streamOptions);
    } else {
      result = await streamCodex(context, screenshotPath, execOptions, streamOptions);
    }

    const duration = Date.now() - startTime;
    finish({
      ...result,
      engine: engine || result?.engine,
      filesModified: !!result?.success,
      duration,
      timestamp: Date.now(),
      project: project ? { id: project.id, name: project.name, workingDirectory } : null
    });
  } catch (error) {
    logError('Execute stream error:', error.message);
    sendError(error.message || 'Stream execution failed');
    finish({ success: false, error: error.message || 'Stream execution failed', timestamp: Date.now() });
  } finally {
    if (screenshotPath) {
      try { fs.unlinkSync(screenshotPath); } catch (error) { logError('Failed to delete screenshot:', error.message); }
    }
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
      try { log(`[stdout] ${chunk.slice(0, 2000)}`); } catch (_) { }
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      try { log(`[stderr] ${chunk.slice(0, 2000)}`); } catch (_) { }
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

  const preferJsonTimeline = !!(config.features && config.features.useJsonTimeline);
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

  const useJsonChunks = preferJsonTimeline && capabilities.supportsJson;
  if (useJsonChunks) {
    args.push('--json');
  }

  const longPrompt = (prompt && prompt.length > 500) || /\n/.test(prompt || '');
  const useStdin = longPrompt || !!(capabilities.supportsImage && screenshotPath);
  if (!useStdin) {
    args.push(prompt);
  }

  const cmdPreview = args.join(' ') + (useStdin ? ' <prompt-from-stdin>' : ' <prompt>');
  log('Executing Codex:', cmdPreview);
  log('Using stdin for prompt:', useStdin);
  log('--- Codex started ---');
  log('Working directory:', execOptions.cwd || config.workingDirectory);

  const cd = await detectCLI('codex');
  const result = await runCommand(cd.bin || 'codex', args, {
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

  const { parseToLumiResult, buildTimelineFromChunks } = require('./parse');
  let parsedChunks = null;
  let structuredStdout = null;
  let parsedMeta = null;
  if (useJsonChunks) {
    try {
      const { parseCodexJsonOutput } = require('./parse');
      const parsed = parseCodexJsonOutput(result.stdout);
      parsedMeta = parsed;
      if (parsed && Array.isArray(parsed.chunks) && parsed.chunks.length) {
        parsedChunks = parsed.chunks;
      }
      if (parsed && parsed.stdout) {
        structuredStdout = parsed.stdout;
      }
      if (!parsedChunks) {
        log('Codex JSON parse yielded no chunks; falling back to text output without timeline.');
      }
    } catch (error) {
      logError('Codex JSON parse failed:', error.message);
    }
  }

  const outputPayload = structuredStdout && structuredStdout.trim()
    ? structuredStdout
    : result.stdout;
  const lumiResult = parseToLumiResult('codex', outputPayload);
  let timelineEntries = null;
  let turnSummary = null;
  if (parsedChunks) {
    try {
      const built = buildTimelineFromChunks(parsedChunks, {});
      if (built) {
        timelineEntries = built.timeline;
        turnSummary = built.summary;
      }
    } catch (error) {
      logError('Failed to build timeline from Codex chunks:', error.message);
    }
  }
  if (parsedMeta && parsedMeta.summary) {
    if (!lumiResult.summary) lumiResult.summary = {};
    if (!lumiResult.summary.title || lumiResult.summary.title === 'Assistant response') {
      lumiResult.summary.title = parsedMeta.summary;
    }
    if (!lumiResult.summary.description) {
      lumiResult.summary.description = parsedMeta.summary;
    }
  }
  // Strip misleading "Updated N files" phrasing from summary description when present
  try {
    if (lumiResult.summary && typeof lumiResult.summary.description === 'string') {
      lumiResult.summary.description = lumiResult.summary.description
        .replace(/Updated\s+\d+\s+file(s)?\.?/gi, '')
        .trim();
    }
  } catch (_) {
    // ignore sanitize errors
  }
  if (parsedMeta && parsedMeta.usage) {
    lumiResult.usage = parsedMeta.usage;
  }

  return {
    success: true,
    output: outputPayload,
    stderr: result.stderr,
    engine: 'codex',
    lumiResult,
    ...(parsedChunks ? { chunks: parsedChunks } : {}),
    ...(timelineEntries ? { timelineEntries } : {}),
    ...(turnSummary ? { turnSummary } : {})
  };
}

async function streamCodex(context, screenshotPath, execOptions = {}, emit = {}) {
  const { sendChunk, sendError, setProc } = emit;
  const capabilities = await detectCLI('codex');

  if (!capabilities.available) {
    sendError?.('Codex CLI not available');
    return {
      success: false,
      error: 'Codex CLI not available',
      message: 'Please install Codex CLI or check your PATH'
    };
  }

  if (!capabilities.supportsJson) {
    const message = 'Codex CLI does not support --json; streaming timeline unavailable';
    sendError?.(message);
    return { success: false, error: message };
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

  args.push('--json');

  const longPrompt = (prompt && prompt.length > 500) || /\n/.test(prompt || '');
  const useStdin = longPrompt || !!(capabilities.supportsImage && screenshotPath);
  if (!useStdin) {
    args.push(prompt);
  }

  const cmdPreview = args.join(' ') + (useStdin ? ' <prompt-from-stdin>' : ' <prompt>');
  log('Streaming Codex:', cmdPreview);
  log('Using stdin for prompt:', useStdin);
  log('--- Codex stream started ---');
  log('Working directory:', execOptions.cwd || config.workingDirectory);

  const cd = await detectCLI('codex');
  const proc = spawn(cd.bin || 'codex', args, {
    shell: false,
    timeout: 3600000,
    cwd: execOptions.cwd || config.workingDirectory,
    stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
  });
  if (setProc) setProc(proc);

  const { codexEventToChunks, createChunkFactory } = require('./parse/codex-json');
  const { parseToLumiResult, buildTimelineFromChunks } = require('./parse');
  const stamp = createChunkFactory();
  const chunks = [];
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let aggregatedText = [];
  let summary = '';
  let usage = null;

  let leftover = '';
  const processLine = (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    try {
      const event = JSON.parse(trimmed);
      if (event?.type === 'turn.completed' && event.usage) {
        usage = event.usage;
      }
      const partial = codexEventToChunks(event, stamp);
      if (partial.summary && !summary) summary = partial.summary;
      if (Array.isArray(partial.aggregatedText) && partial.aggregatedText.length) {
        aggregatedText.push(...partial.aggregatedText);
      }
      partial.chunks.forEach((chunk) => {
        chunks.push(chunk);
        sendChunk?.(chunk);
      });
    } catch (_) {
      // Ignore malformed lines; fallback logic will handle missing chunks
    }
  };

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    stdoutBuffer += text;
    leftover += text;
    const parts = leftover.split(/\r?\n/);
    leftover = parts.pop() || '';
    parts.forEach(processLine);
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    stderrBuffer += text;
  });

  if (useStdin && proc.stdin) {
    try {
      proc.stdin.write(prompt);
      proc.stdin.end();
    } catch (_) {
      // ignore stdin errors
    }
  }

  let exitCode = 0;
  await new Promise((resolve) => {
    proc.on('close', (code) => {
      exitCode = typeof code === 'number' ? code : 0;
      resolve();
    });
    proc.on('error', (error) => {
      stderrBuffer += error?.message || '';
      exitCode = exitCode || -1;
      resolve();
    });
  });

  if (leftover.trim()) {
    processLine(leftover.trim());
  }

  if (exitCode !== 0 && !chunks.some((c) => c && c.type === 'error')) {
    const errorChunk = stamp({
      type: 'error',
      text: `Codex exited with code ${exitCode}`
    });
    chunks.push(errorChunk);
    sendChunk?.(errorChunk);
  }

  log('--- Codex stream ended ---');

  // In --json mode, only use aggregatedText (no fallback to raw stdout)
  const outputPayload = aggregatedText.join('\n');
  const lumiResult = parseToLumiResult('codex', outputPayload);
  if (summary) {
    if (!lumiResult.summary) lumiResult.summary = {};
    if (!lumiResult.summary.title || lumiResult.summary.title === 'Assistant response') {
      lumiResult.summary.title = summary;
    }
    if (!lumiResult.summary.description) {
      lumiResult.summary.description = summary;
    }
  }
  if (usage) {
    lumiResult.usage = usage;
  }

  let timelineEntries = null;
  let turnSummary = null;
  if (chunks.length) {
    try {
      const built = buildTimelineFromChunks(chunks, {});
      if (built) {
        timelineEntries = built.timeline;
        turnSummary = built.summary;
      }
    } catch (error) {
      logError('Failed to build timeline from Codex stream:', error.message);
    }
  }

  return {
    success: exitCode === 0,
    output: outputPayload,
    stderr: stderrBuffer,
    engine: 'codex',
    lumiResult,
    chunks,
    ...(timelineEntries ? { timelineEntries } : {}),
    ...(turnSummary ? { turnSummary } : {}),
    ...(usage ? { usage } : {}),
    ...(exitCode !== 0 ? { error: stderrBuffer || 'Codex execution failed' } : {})
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
  const preferJsonTimeline = !!(config.features && config.features.useJsonTimeline);

  if (capabilities.supportsPrompt) {
    args.push('-p', prompt);
  } else {
    args.push(prompt);
  }

  if (config.claude.model) {
    args.push('--model', config.claude.model);
  }

  const useStreamJson = preferJsonTimeline && capabilities.supportsOutputFormat;
  const desiredOutputFormat = useStreamJson
    ? 'stream-json'
    : config.claude.outputFormat;
  if (capabilities.supportsOutputFormat && desiredOutputFormat) {
    args.push('--output-format', desiredOutputFormat);
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

  const cl = await detectCLI('claude');
  const result = await runCommand(cl.bin || 'claude', args, {
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

  let parsedChunks = null;
  let parsedMeta = null;
  if (useStreamJson) {
    try {
      const { parseClaudeStreamJson } = require('./parse');
      const parsed = parseClaudeStreamJson(result.stdout);
      parsedMeta = parsed;
      if (parsed && Array.isArray(parsed.chunks) && parsed.chunks.length) {
        parsedChunks = parsed.chunks;
      } else {
        log('Claude stream-json parse yielded no chunks; falling back to text output without timeline.');
      }
    } catch (error) {
      logError('Claude stream-json parse failed:', error.message);
    }
  }

  let output = result.stdout;
  if (!useStreamJson && capabilities.supportsOutputFormat && config.claude.outputFormat === 'json') {
    try {
      output = JSON.parse(result.stdout);
    } catch (error) {
      // keep as string if parse fails
    }
  }

  const { parseToLumiResult, buildTimelineFromChunks } = require('./parse');
  const lumiResult = parseToLumiResult('claude', output);
  let timelineEntries = null;
  let turnSummary = null;
  if (parsedChunks) {
    try {
      const built = buildTimelineFromChunks(parsedChunks, {});
      if (built) {
        timelineEntries = built.timeline;
        turnSummary = built.summary;
      }
    } catch (error) {
      logError('Failed to build timeline from Claude chunks:', error.message);
    }
  }
  if (parsedMeta && parsedMeta.summary) {
    if (!lumiResult.summary) lumiResult.summary = {};
    if (!lumiResult.summary.title || lumiResult.summary.title === 'Proposed edits') {
      lumiResult.summary.title = parsedMeta.summary;
    }
    if (!lumiResult.summary.description) {
      lumiResult.summary.description = parsedMeta.summary;
    }
  }
  return {
    success: true,
    output,
    stderr: result.stderr,
    engine: 'claude',
    lumiResult,
    ...(parsedChunks ? { chunks: parsedChunks } : {}),
    ...(timelineEntries ? { timelineEntries } : {}),
    ...(turnSummary ? { turnSummary } : {})
  };
}

async function streamClaude(context, screenshotPath, execOptions = {}, emit = {}) {
  const { sendChunk, sendError, setProc } = emit;
  const capabilities = await detectCLI('claude');

  if (!capabilities.available) {
    sendError?.('Claude CLI not available');
    return {
      success: false,
      error: 'Claude CLI not available',
      message: 'Please install Claude Code CLI or check your PATH'
    };
  }

  if (!capabilities.supportsOutputFormat) {
    const message = 'Claude CLI does not support --output-format stream-json; streaming timeline unavailable';
    sendError?.(message);
    return { success: false, error: message };
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

  args.push('--output-format', 'stream-json');

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

  log('Streaming Claude:', 'claude', args.slice(0, 4).join(' '), '...');

  const cl = await detectCLI('claude');
  const proc = spawn(cl.bin || 'claude', args, {
    shell: false,
    timeout: 3600000,
    cwd: execOptions.cwd || config.workingDirectory
  });
  if (setProc) setProc(proc);

  const { claudeEventToChunks, createChunkFactory } = require('./parse/claude-stream-json');
  const { parseToLumiResult, buildTimelineFromChunks } = require('./parse');
  const stamp = createChunkFactory();
  const chunks = [];
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let summary = '';
  const aggregatedText = [];

  let leftover = '';
  const processLine = (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    try {
      const event = JSON.parse(trimmed);
      const partial = claudeEventToChunks(event, stamp);
      if (partial.summary && !summary) summary = partial.summary;
      partial.chunks.forEach((chunk) => {
        chunks.push(chunk);
        if (chunk.text) aggregatedText.push(chunk.text);
        if (chunk.resultSummary) aggregatedText.push(chunk.resultSummary);
        sendChunk?.(chunk);
      });
    } catch (_) {
      // Ignore malformed lines to keep stream resilient
    }
  };

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    stdoutBuffer += text;
    leftover += text;
    const parts = leftover.split(/\r?\n/);
    leftover = parts.pop() || '';
    parts.forEach(processLine);
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    stderrBuffer += text;
  });

  let exitCode = 0;
  await new Promise((resolve) => {
    proc.on('close', (code) => {
      exitCode = typeof code === 'number' ? code : 0;
      resolve();
    });
    proc.on('error', (error) => {
      stderrBuffer += error?.message || '';
      exitCode = exitCode || -1;
      resolve();
    });
  });

  if (leftover.trim()) {
    processLine(leftover.trim());
  }

  if (exitCode !== 0 && !chunks.some((c) => c && c.type === 'error')) {
    const errorChunk = stamp({
      type: 'error',
      text: `Claude exited with code ${exitCode}`
    });
    chunks.push(errorChunk);
    sendChunk?.(errorChunk);
  }

  const outputPayload = aggregatedText.join('\n') || stdoutBuffer;
  const lumiResult = parseToLumiResult('claude', outputPayload);
  if (summary) {
    if (!lumiResult.summary) lumiResult.summary = {};
    if (!lumiResult.summary.title || lumiResult.summary.title === 'Proposed edits') {
      lumiResult.summary.title = summary;
    }
    if (!lumiResult.summary.description) {
      lumiResult.summary.description = summary;
    }
  }

  let timelineEntries = null;
  let turnSummary = null;
  if (chunks.length) {
    try {
      const built = buildTimelineFromChunks(chunks, {});
      if (built) {
        timelineEntries = built.timeline;
        turnSummary = built.summary;
      }
    } catch (error) {
      logError('Failed to build timeline from Claude stream:', error.message);
    }
  }

  return {
    success: exitCode === 0,
    output: outputPayload,
    stderr: stderrBuffer,
    engine: 'claude',
    lumiResult,
    chunks,
    ...(timelineEntries ? { timelineEntries } : {}),
    ...(turnSummary ? { turnSummary } : {}),
    ...(exitCode !== 0 ? { error: stderrBuffer || 'Claude execution failed' } : {})
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
    supportsJson: false,
    supportsOutputFormat: false,
    supportsModel: false,
    supportsSandbox: false,
    supportsPrompt: false,
    timestamp: Date.now()
  };

  try {
    // Resolve the actual binary name for this CLI
    const resolved = cliName === 'codex'
      ? await resolveCLIName('codex', ['codex-cli', 'openai-codex'])
      : await resolveCLIName('claude', ['claude-code']);
    capabilities.bin = resolved || cliName;

    const versionResult = await runCommand(capabilities.bin, ['--version'], { timeout: 5000 });
    log(`Detected ${cliName} binary: ${capabilities.bin}`);
    if (versionResult.exitCode === 0) {
      capabilities.available = true;
      capabilities.version = versionResult.stdout.trim().split('\n')[0];
    }

    const helpResult = await runCommand(capabilities.bin, ['--help'], { timeout: 5000 });
    if (helpResult.exitCode === 0) {
      const helpText = helpResult.stdout + helpResult.stderr;

      if (cliName === 'codex') {
        capabilities.supportsImage = helpText.includes('-i') || helpText.includes('--image');
        capabilities.supportsModel = helpText.includes('--model');
        capabilities.supportsSandbox = helpText.includes('--sandbox');
        capabilities.supportsJson = helpText.includes('--json');
        if (!capabilities.supportsJson) {
          try {
            const execHelp = await runCommand(capabilities.bin, ['exec', '--help'], { timeout: 5000 });
            if (execHelp.exitCode === 0) {
              const execText = execHelp.stdout + execHelp.stderr;
              capabilities.supportsJson = execText.includes('--json');
            }
          } catch (_) {
            // ignore exec help detection errors; fallback to non-JSON path
          }
        }
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
  let prompt = `# User Intent\n${context.intent}\n\n`;

  // Context Reference Map
  prompt += `# Context Reference Map\n`;
  prompt += `- Page: ${context.pageUrl}\n`;
  prompt += `- Title: ${context.pageTitle}\n`;
  prompt += `- Selection Mode: ${context.selectionMode}\n`;

  if (Array.isArray(context.elements) && context.elements.length > 0) {
    prompt += `\n## Selected Elements\n`;
    context.elements.forEach(el => {
      const words = (el.textContent || el.text || '').trim().split(/\s+/).filter(Boolean);
      const textSummary = words.length > 0 ? `text: \"${words.slice(0, 6).join(' ')}${words.length > 6 ? '…' : ''}\"` : 'no text';
      const desc = `${el.selector || el.tagName || 'element'} — ${textSummary}`;
      prompt += `- **${el.tag}**: ${desc}\n`;
    });
  }

  if (Array.isArray(context.screenshots) && context.screenshots.length > 0) {
    prompt += `\n## Screenshots\n`;
    context.screenshots.forEach(s => {
      const w = Math.round(s?.bbox?.width || 0);
      const h = Math.round(s?.bbox?.height || 0);
      const x = Math.round(s?.bbox?.left || 0);
      const y = Math.round(s?.bbox?.top || 0);
      prompt += `- **${s.tag}**: ${w}×${h}px area at (${x}, ${y})\n`;
    });
  }

  // Visual Edits (Before → After)
  if (Array.isArray(context.edits) && context.edits.length > 0) {
    prompt += `\n# Visual Edits Applied\n`;
    prompt += `User made the following changes via WYSIWYG editor:\n\n`;
    context.edits.forEach((edit) => {
      prompt += `## ${edit.tag} Edits\n`;
      (edit.diffs || []).forEach(({ property, before, after }) => {
        prompt += `- **${property}**: \`${String(before)}\` → \`${String(after)}\`\n`;
      });
      prompt += `\n`;
    });
  }

  // Detailed Element Context (collapsible)
  if (Array.isArray(context.elements) && context.elements.length > 0) {
    prompt += `\n# Detailed Element Context\n`;
    context.elements.forEach(el => {
      prompt += `\n<details>\n<summary>${el.tag} — ${el.selector}</summary>\n\n`;
      prompt += renderElementDetail(el);
      prompt += `</details>\n`;
    });
  } else if (context.element) {
    prompt += `\n## Selected Element\n`;
    prompt += renderElementDetail(context.element);
  }

  // Legacy single bbox
  if (context.bbox) {
    prompt += `\n## Selection Area\n`;
    prompt += `- Position: (${Math.round(context.bbox.left)}, ${Math.round(context.bbox.top)})\n`;
    prompt += `- Size: ${Math.round(context.bbox.width)} × ${Math.round(context.bbox.height)}px\n`;
  }

  // Instructions
  prompt += `\n# Instructions\n`;
  prompt += `- The user's intent may reference tags like ${context.elements?.[0]?.tag || '@element1'}\n`;
  prompt += `- Use the Reference Map above to understand which element/screenshot each tag refers to\n`;
  prompt += `- Apply changes ONLY to the referenced elements in the user's intent\n`;
  prompt += `- For WYSIWYG edits, apply the exact before→after changes shown\n`;
  prompt += `- Modify files directly; maintain code quality and accessibility\n`;

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

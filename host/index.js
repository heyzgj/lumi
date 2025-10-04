#!/usr/bin/env node
/**
 * LUMI Native Messaging Host
 * - Reads JSON messages from stdin (4-byte LE length + JSON)
 * - Performs capability probe for Codex/Claude
 * - Builds prompt, optionally saves screenshot to temp
 * - Invokes CLI and applies diff via git apply on a temp branch
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    return cfg;
  } catch {
    return { projectMap: {}, defaults: { engine: 'codex', approvals: 'auto', network: 'off' } };
  }
}

function writeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  process.stdout.write(len);
  process.stdout.write(json);
}

function readMessage() {
  return new Promise((resolve, reject) => {
    const lenBuf = Buffer.alloc(4);
    let offset = 0;
    function readLen() {
      const chunk = process.stdin.read(4 - offset);
      if (!chunk) return process.stdin.once('readable', readLen);
      chunk.copy(lenBuf, offset);
      offset += chunk.length;
      if (offset < 4) return readLen();
      const len = lenBuf.readUInt32LE(0);
      readBody(len);
    }
    function readBody(len) {
      let acc = Buffer.alloc(0);
      function readMore() {
        const chunk = process.stdin.read(len - acc.length);
        if (!chunk) return process.stdin.once('readable', readMore);
        acc = Buffer.concat([acc, chunk]);
        if (acc.length < len) return readMore();
        try { resolve(JSON.parse(acc.toString('utf8'))); }
        catch (e) { reject(e); }
      }
      readMore();
    }
    readLen();
  });
}

async function main() {
  const cfg = readConfig();
  while (true) {
    try {
      const msg = await readMessage();
      if (!msg || typeof msg !== 'object') {
        writeMessage({ ok: false, error: 'Invalid message' });
        continue;
      }
      if (msg.action === 'PING') {
        const caps = await probeAll();
        writeMessage({ ok: true, ts: Date.now(), caps });
        continue;
      }
      if (msg.action === 'APPLY_PROMPT') {
        const result = await handleApplyPrompt(cfg, msg);
        writeMessage(result);
        continue;
      }
      writeMessage({ ok: false, error: 'Unknown action' });
    } catch (e) {
      writeMessage({ ok: false, error: String(e?.message || e) });
    }
  }
}

async function handleApplyPrompt(cfg, msg) {
  const engine = (msg.engine || cfg.defaults?.engine || 'codex').toLowerCase();
  const selection = msg.selection || {};
  const prompt = msg.prompt || '';
  const screenshotBase64 = msg.screenshot || null;

  // Resolve project root by origin (host of pageURL)
  const origin = tryGetOrigin(selection.pageURL);
  const projectRoot = cfg.projectMap?.[origin] || cfg.projectMap?.default || process.cwd();

  const tempFiles = [];
  const imagePath = screenshotBase64 ? saveTempPng(screenshotBase64, tempFiles) : null;

  const caps = await probeAll();
  const ctx = {
    projectRoot,
    imagePath,
    engine,
    approvals: cfg.defaults?.approvals || 'auto',
  };

  const finalPrompt = buildPrompt(prompt, selection);
  const runRes = await runEngine(caps, ctx, finalPrompt);
  if (!runRes.ok) {
    cleanupTemps(tempFiles);
    return runRes;
  }

  const applyRes = await applyPatch(projectRoot, runRes.diffText);
  cleanupTemps(tempFiles);
  return { ok: applyRes.ok, message: applyRes.message, diffSummary: applyRes.summary, stdoutTail: runRes.tail };
}

function tryGetOrigin(url) {
  try { return new URL(url).origin; } catch { return 'default'; }
}

function saveTempPng(base64, bag) {
  const p = path.join(os.tmpdir(), `lumi_${Date.now()}.png`);
  fs.writeFileSync(p, Buffer.from(base64, 'base64'));
  bag.push(p);
  return p;
}

function cleanupTemps(bag) {
  for (const p of bag) {
    try { fs.unlinkSync(p); } catch {}
  }
}

function buildPrompt(userPrompt, selection) {
  const basic = [
    'Task: Modify the codebase with minimal diffs to satisfy the request.',
    'Constraints: Only change the view layer; keep ESLint clean; keep changes minimal; include unified diff output only, no prose.',
    `Page: ${selection.pageURL || ''}`,
    `Selection: ${selection.type || ''} ${selection.selector || ''} bbox=${JSON.stringify(selection.bbox || {})}`,
    selection.html ? `HTML:\n\n${selection.html}` : '',
    selection.styleSummary ? `\nCSS-Computed-Summary:\n${JSON.stringify(selection.styleSummary, null, 2)}` : '',
    '\nUser Request:\n' + userPrompt,
    '\nOutput strictly as unified diff (git apply compatible). Do not include explanations.'
  ].filter(Boolean).join('\n');
  return basic;
}

async function probeAll() {
  return {
    codex: await probeCmd('codex', ['--help']),
    claude: await probeCmd('claude', ['--help'])
  };
}

async function probeCmd(cmd, args) {
  try {
    const out = cp.execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000 });
    return { available: true, help: out.slice(0, 4000) };
  } catch (e) {
    return { available: false, error: String(e?.message || e) };
  }
}

async function runEngine(caps, ctx, prompt) {
  if (ctx.engine === 'claude' && caps.claude.available) {
    return runClaude(ctx, prompt);
  }
  if (caps.codex.available) return runCodex(caps, ctx, prompt);
  return { ok: false, error: 'No available engine' };
}

async function runCodex(caps, ctx, prompt) {
  const args = [];
  if (ctx.imagePath && (caps.codex.help.includes('-i') || caps.codex.help.includes('--image'))) {
    args.push('-i', ctx.imagePath);
  }
  args.push('exec');
  // approvals flag best-effort; fallback to defaults if unknown
  if (/--approvals/.test(caps.codex.help) && ctx.approvals) {
    args.push('--approvals', ctx.approvals);
  }
  // prefer explicit model if documented
  if (/--model/.test(caps.codex.help)) {
    args.push('--model', 'gpt-5-codex');
  }
  args.push(prompt);

  try {
    const out = cp.execFileSync('codex', args, { cwd: ctx.projectRoot, encoding: 'utf8', timeout: 10 * 60 * 1000 });
    const diffText = extractDiff(out);
    return { ok: true, diffText, tail: tail(out) };
  } catch (e) {
    return { ok: false, error: 'codex failed: ' + String(e?.message || e) };
  }
}

async function runClaude(ctx, prompt) {
  const args = ['-p', prompt];
  // prefer structured output if available
  args.push('--output-format', 'json');
  try {
    const out = cp.execFileSync('claude', args, { cwd: ctx.projectRoot, encoding: 'utf8', timeout: 10 * 60 * 1000 });
    let diffText = null;
    try { const j = JSON.parse(out); diffText = j?.diff || j?.output || j?.text || null; } catch {}
    if (!diffText) diffText = extractDiff(out);
    return { ok: true, diffText, tail: tail(out) };
  } catch (e) {
    return { ok: false, error: 'claude failed: ' + String(e?.message || e) };
  }
}

function extractDiff(text) {
  if (!text) return '';
  const codeBlock = /```diff\n([\s\S]*?)```/m.exec(text);
  if (codeBlock) return codeBlock[1];
  const idx = text.indexOf('diff --git ');
  if (idx >= 0) return text.slice(idx);
  const idx2 = text.indexOf('--- ');
  if (idx2 >= 0) return text.slice(idx2);
  return text; // best effort
}

async function applyPatch(projectRoot, diffText) {
  if (!diffText || !diffText.trim()) return { ok: false, message: 'No diff' };
  try {
    const inside = cp.execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectRoot, encoding: 'utf8' }).trim() === 'true';
    if (!inside) return { ok: false, message: 'Not a git repo' };
  } catch {
    return { ok: false, message: 'Git not available or not a repo' };
  }
  const branch = `lumi-ai-${Date.now()}`;
  try {
    cp.execFileSync('git', ['checkout', '-b', branch], { cwd: projectRoot, encoding: 'utf8' });
  } catch {}
  try {
    const proc = cp.spawnSync('git', ['apply', '--reject', '--whitespace=nowarn'], { cwd: projectRoot, input: diffText, encoding: 'utf8' });
    if (proc.status !== 0) {
      return { ok: false, message: 'git apply failed', summary: proc.stderr?.slice(0, 400) };
    }
    cp.execFileSync('git', ['add', '-A'], { cwd: projectRoot });
    cp.execFileSync('git', ['commit', '-m', 'feat(ai): apply patch from LUMI'], { cwd: projectRoot });
    return { ok: true, message: `Patch applied on ${branch}`, summary: `branch=${branch}` };
  } catch (e) {
    return { ok: false, message: 'apply error: ' + String(e?.message || e) };
  }
}

function tail(s, n = 800) { return (s || '').slice(-n); }

main();


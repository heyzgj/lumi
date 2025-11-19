const { parseCodexOutput } = require('./codex');
const { parseClaudeOutput } = require('./claude');
const { parseCodexJsonOutput } = require('./codex-json');
const { parseClaudeStreamJson } = require('./claude-stream-json');

// ---------------------------------------------------------------------------
// Timeline / Summary helpers (v1 minimal model)
// ---------------------------------------------------------------------------

const TurnStage = {
  PLAN: 'plan',
  ACT: 'act',
  EDIT: 'edit',
  VERIFY: 'verify'
};

const EntryKind = {
  PLAN: 'plan',
  COMMAND: 'command',
  FILE_CHANGE: 'file-change',
  TEST: 'test',
  FINAL: 'final-message',
  ERROR: 'error'
};

const EntryStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed'
};

function stripFileCount(text = '') {
  try {
    return String(text).replace(/Updated\s+\d+\s+file(s)?\.?/gi, '').trim();
  } catch (_) {
    return text;
  }
}

/**
 * Build a minimal timeline and summary from Chunk[]
 * @param {Array} chunks raw chunk array
 * @param {Object} timing optional timing info { durationMs?: number }
 * @returns {{ summary: any, timeline: any[] }}
 */
function buildTimelineFromChunks(chunks = [], timing = {}) {
  const entries = [];
  const chunkArray = Array.isArray(chunks) ? chunks : [];
  let counter = 0;
  const nextId = (kind) => `${kind || 'entry'}_${++counter}`;

  // Plan (first thinking/todo-like chunk)
  const planChunk = chunkArray.find((c) => c && c.type === 'thinking') || null;
  if (planChunk && (planChunk.text || planChunk.resultSummary)) {
    entries.push({
      id: nextId(EntryKind.PLAN),
      stage: TurnStage.PLAN,
      kind: EntryKind.PLAN,
      status: EntryStatus.DONE,
      title: 'Plan',
      body: planChunk.resultSummary || planChunk.text || '',
      sourceChunkIds: planChunk.id ? [planChunk.id] : undefined
    });
  }

  // Commands/logs — group into summary entries instead of raw stream
  const runChunks = chunkArray.filter((c) => c && (c.type === 'run' || c.type === 'log'));
  const runCommands = runChunks.filter((c) => c.type === 'run');
  const runLogs = runChunks.filter((c) => c.type === 'log' && c.text).map((c) => c.text.trim()).filter(Boolean);

  const pickLogs = (list) => list.slice(0, 8).join('\n') || undefined; // keep short; raw logs live elsewhere

  const isTestCommand = (cmd = '') => /(?:npm|pnpm|yarn)\s+test\b|pytest\b|go test\b/i.test(cmd);
  const isSearchCommand = (cmd = '') => /\brg\b|\bgrep\b|\bfind\b|\bfd\b/i.test(cmd);
  const isInspectCommand = (cmd = '') => /\bsed\b|\bcat\b|\bnl\b|\bhead\b|\btail\b/i.test(cmd);
  const isNoiseCommand = (cmd = '') => /^\s*ls\b/i.test(cmd);

  const testRuns = runCommands.filter((c) => isTestCommand(c.cmd));
  const searchRuns = runCommands.filter((c) => isSearchCommand(c.cmd));
  const inspectRuns = runCommands.filter((c) => isInspectCommand(c.cmd));
  const otherRuns = runCommands.filter(
    (c) => !isTestCommand(c.cmd) && !isSearchCommand(c.cmd) && !isInspectCommand(c.cmd) && !isNoiseCommand(c.cmd)
  );

  if (searchRuns.length) {
    const title = searchRuns[0].cmd || 'Searched project';
    entries.push({
      id: nextId(EntryKind.COMMAND),
      stage: TurnStage.ACT,
      kind: EntryKind.COMMAND,
      status: EntryStatus.DONE,
      title,
      body: pickLogs(runLogs),
      sourceChunkIds: searchRuns.map((c) => c.id).filter(Boolean)
    });
  }

  if (inspectRuns.length) {
    entries.push({
      id: nextId(EntryKind.COMMAND),
      stage: TurnStage.ACT,
      kind: EntryKind.COMMAND,
      status: EntryStatus.DONE,
      title: 'Inspected files',
      body: pickLogs(runLogs),
      sourceChunkIds: inspectRuns.map((c) => c.id).filter(Boolean)
    });
  }

  if (otherRuns.length) {
    const title = otherRuns[0].cmd || 'Run command';
    entries.push({
      id: nextId(EntryKind.COMMAND),
      stage: TurnStage.ACT,
      kind: EntryKind.COMMAND,
      status: EntryStatus.DONE,
      title,
      body: pickLogs(runLogs),
      sourceChunkIds: otherRuns.map((c) => c.id).filter(Boolean)
    });
  }

  if (testRuns.length) {
    const title = testRuns[0].cmd || 'Run tests';
    entries.push({
      id: nextId(EntryKind.TEST),
      stage: TurnStage.VERIFY,
      kind: EntryKind.TEST,
      status: EntryStatus.DONE,
      title,
      body: pickLogs(runLogs),
      sourceChunkIds: testRuns.map((c) => c.id).filter(Boolean)
    });
  }

  // File changes
  const editChunks = chunkArray.filter((c) => c && c.type === 'edit' && c.file && c.file !== 'unknown');
  if (editChunks.length) {
    const files = Array.from(
      new Set(editChunks.map((c) => (c.file || '').trim()).filter(Boolean))
    );
    entries.push({
      id: nextId(EntryKind.FILE_CHANGE),
      stage: TurnStage.EDIT,
      kind: EntryKind.FILE_CHANGE,
      status: EntryStatus.DONE,
      title: files.length ? `Edited ${files.length} file(s)` : 'Modified code',
      files,
      body: files.join('\n') || undefined,
      sourceChunkIds: editChunks.map((c) => c.id).filter(Boolean)
    });
  }

  // Final message
  const resultChunk = [...chunkArray].reverse().find((c) => c && c.type === 'result');
  if (resultChunk && (resultChunk.resultSummary || resultChunk.text)) {
    entries.push({
      id: nextId(EntryKind.FINAL),
      stage: TurnStage.VERIFY,
      kind: EntryKind.FINAL,
      status: EntryStatus.DONE,
      title: 'Result',
      body: stripFileCount(resultChunk.resultSummary || resultChunk.text || ''),
      sourceChunkIds: resultChunk.id ? [resultChunk.id] : undefined
    });
  }

  // Error
  const errorChunk = chunkArray.find((c) => c && c.type === 'error');
  if (errorChunk && (errorChunk.message || errorChunk.text)) {
    entries.push({
      id: nextId(EntryKind.ERROR),
      stage: TurnStage.VERIFY,
      kind: EntryKind.ERROR,
      status: EntryStatus.FAILED,
      title: 'Error',
      body: errorChunk.message || errorChunk.text || '',
      sourceChunkIds: errorChunk.id ? [errorChunk.id] : undefined
    });
  }

  // Summary
  const hasError = entries.some((e) => e.kind === EntryKind.ERROR);
  const testEntries = entries.filter((e) => e.kind === EntryKind.TEST);

  let testsStatus = 'not_run';
  if (testEntries.length) {
    testsStatus = hasError ? 'failed' : 'passed'; // v1 heuristic
  }

  let status = 'success';
  if (hasError) status = 'failed';

  const hasCommand = entries.some((e) => e.kind === EntryKind.COMMAND || e.kind === EntryKind.TEST);
  let hasEdit = entries.some((e) => e.kind === EntryKind.FILE_CHANGE);

  // Heuristic: if final result summary clearly describes edits (e.g., starts with "Updated"),
  // treat this turn as having edits even when we don't yet have explicit edit chunks.
  const resultChunk = [...chunkArray].reverse().find((c) => c && c.type === 'result');
  const resultText = resultChunk && (resultChunk.resultSummary || resultChunk.text || '');
  if (!hasEdit && resultText) {
    const t = String(resultText);
    if (/^\s*(Updated|Modified|Refactored|Renamed)\b/i.test(t)) {
      hasEdit = true;
    }
  }

  let title = 'Ran assistant once';
  if (hasCommand && hasEdit) title = 'Ran command and modified files';
  else if (hasEdit) title = 'Modified files';
  else if (hasCommand) title = 'Ran command';

  const summary = {
    status,
    title,
    meta: {
      commandCount: entries.filter((e) => e.kind === EntryKind.COMMAND || e.kind === EntryKind.TEST).length,
      durationMs: typeof timing.durationMs === 'number' ? timing.durationMs : undefined,
      testsStatus
    },
    bullets: []
  };

  if (resultChunk && (resultChunk.resultSummary || resultChunk.text)) {
    let text = stripFileCount(resultChunk.resultSummary || resultChunk.text);
    if (text) summary.bullets.push(text.slice(0, 200));
  }
  if (testsStatus === 'not_run') {
    summary.bullets.push('No automated tests were run');
  }

  return { summary, timeline: entries };
}

function parseToLumiResult(engine, output) {
  try {
    if (engine === 'codex') return parseCodexOutput(String(output || ''));
    if (engine === 'claude') return parseClaudeOutput(output);
  } catch (e) {
    // fallthrough
  }
  return {
    engine,
    model: null,
    summary: { title: 'Assistant response', description: '' },
    changes: [],
    rawOutput: typeof output === 'string' ? output : JSON.stringify(output || ''),
    outputType: 'text',
    parseErrors: ['Failed to parse engine output']
  };
}

module.exports = {
  parseToLumiResult,
  parseCodexJsonOutput,
  parseClaudeStreamJson,
  buildTimelineFromChunks,
  TurnStage,
  EntryKind,
  EntryStatus
};

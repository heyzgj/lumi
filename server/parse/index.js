const { parseCodexOutput } = require('./codex');
const { parseClaudeOutput } = require('./claude');
const { parseCodexJsonOutput } = require('./codex-json');
const { parseClaudeStreamJson } = require('./claude-stream-json');

// ---------------------------------------------------------------------------
// Timeline / Summary helpers (v1 chronological model)
// ---------------------------------------------------------------------------

const EntryKind = {
  THINKING: 'thinking',
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
 * Build a linear, chronological timeline from Chunk[]
 * @param {Array} chunks raw chunk array
 * @param {Object} timing optional timing info { durationMs?: number }
 * @returns {{ summary: any, timeline: any[] }}
 */
function buildTimelineFromChunks(chunks = [], timing = {}) {
  const entries = [];
  const chunkArray = Array.isArray(chunks) ? chunks : [];
  let counter = 0;
  const nextId = (kind) => `${kind || 'entry'}_${++counter}`;

  // Helper to detect command types
  const isTestCommand = (cmd = '') => /(?:npm|pnpm|yarn)\s+test\b|pytest\b|go test\b/i.test(cmd);

  // Iterate chunks sequentially
  for (let i = 0; i < chunkArray.length; i++) {
    const c = chunkArray[i];
    if (!c) continue;

    if (c.type === 'thinking') {
      if (c.text || c.resultSummary) {
        entries.push({
          id: nextId(EntryKind.THINKING),
          kind: EntryKind.THINKING,
          status: EntryStatus.DONE,
          title: c.text || 'Thinking...',
          body: c.resultSummary || undefined,
          sourceChunkIds: c.id ? [c.id] : undefined
        });
      }
    } else if (c.type === 'run') {
      // Look ahead for logs/errors associated with this run
      const logs = [];
      let status = EntryStatus.DONE;
      let errorMsg = null;

      // Consume subsequent logs/errors until next non-log chunk
      let j = i + 1;
      while (j < chunkArray.length) {
        const next = chunkArray[j];
        if (next.type === 'log') {
          if (next.text) logs.push(next.text);
          j++;
        } else if (next.type === 'error' && next.runId === c.id) {
          // Error specifically linked to this run
          status = EntryStatus.FAILED;
          errorMsg = next.text;
          j++;
        } else {
          break;
        }
      }
      // Advance main loop
      i = j - 1;

      const kind = isTestCommand(c.cmd) ? EntryKind.TEST : EntryKind.COMMAND;
      entries.push({
        id: nextId(kind),
        kind,
        status,
        title: c.cmd || 'Run command',
        body: errorMsg ? `${errorMsg}\n${logs.join('\n')}` : logs.join('\n'),
        sourceChunkIds: c.id ? [c.id] : undefined
      });

    } else if (c.type === 'edit') {
      // Aggregate consecutive edits
      const files = [c.file];
      const sourceIds = c.id ? [c.id] : [];

      let j = i + 1;
      while (j < chunkArray.length) {
        const next = chunkArray[j];
        if (next.type === 'edit') {
          files.push(next.file);
          if (next.id) sourceIds.push(next.id);
          j++;
        } else {
          break;
        }
      }
      i = j - 1;

      const uniqueFiles = Array.from(new Set(files.filter(Boolean)));
      entries.push({
        id: nextId(EntryKind.FILE_CHANGE),
        kind: EntryKind.FILE_CHANGE,
        status: EntryStatus.DONE,
        title: uniqueFiles.length === 1
          ? `Edited ${uniqueFiles[0]}`
          : `Edited ${uniqueFiles.length} files`,
        files: uniqueFiles,
        sourceChunkIds: sourceIds
      });

    } else if (c.type === 'result') {
      if (c.resultSummary || c.text) {
        entries.push({
          id: nextId(EntryKind.FINAL),
          kind: EntryKind.FINAL,
          status: EntryStatus.DONE,
          title: 'Result',
          body: stripFileCount(c.resultSummary || c.text || ''),
          sourceChunkIds: c.id ? [c.id] : undefined
        });
      }
    } else if (c.type === 'error') {
      // Standalone error (not consumed by run)
      entries.push({
        id: nextId(EntryKind.ERROR),
        kind: EntryKind.ERROR,
        status: EntryStatus.FAILED,
        title: 'Error',
        body: c.message || c.text || '',
        sourceChunkIds: c.id ? [c.id] : undefined
      });
    }
  }

  // --- TurnSummary Generation (Metadata) ---

  const hasError = entries.some((e) => e.status === EntryStatus.FAILED || e.kind === EntryKind.ERROR);
  const testEntries = entries.filter((e) => e.kind === EntryKind.TEST);

  let testsStatus = null; // Default to null (don't show)
  if (testEntries.length) {
    // If any test command failed, we consider tests failed
    const anyTestFailed = testEntries.some(e => e.status === EntryStatus.FAILED);
    testsStatus = anyTestFailed ? 'failed' : 'passed';
  }

  let status = 'success';
  if (hasError) status = 'failed';

  const commandCount = entries.filter((e) => e.kind === EntryKind.COMMAND || e.kind === EntryKind.TEST).length;
  const editEntries = entries.filter((e) => e.kind === EntryKind.FILE_CHANGE);
  const fileCount = new Set(editEntries.flatMap(e => e.files || [])).size;

  // Title Heuristic - simplified to reduce noise
  let title = null;
  // Only show title if it adds value beyond "Ran command"
  if (hasError) title = 'Execution failed';
  else if (testsStatus === 'failed') title = 'Tests failed';

  const summary = {
    status,
    title,
    meta: {
      durationMs: typeof timing.durationMs === 'number' ? timing.durationMs : undefined,
      testsStatus
    },
    bullets: []
  };

  // Extract bullets from final result or edits
  const finalEntry = entries.findLast(e => e.kind === EntryKind.FINAL);
  if (finalEntry && finalEntry.body) {
    summary.bullets.push(finalEntry.body.slice(0, 200));
  }

  if (testsStatus === 'not_run' && commandCount > 0) {
    // Optional: hint about tests
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
  EntryKind,
  EntryStatus
};

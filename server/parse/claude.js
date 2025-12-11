function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  return [val];
}

function computeDiffFromContent(path, content) {
  // We do not compute a real diff here (no workspace snapshot here);
  // return as create/update with content only; UI can display collapsed.
  const lines = typeof content === 'string' ? content.split(/\n/) : [];
  return {
    path: String(path || 'unknown'),
    op: 'update',
    content,
    additions: lines.length || 0,
    deletions: 0,
    hunks: 1
  };
}

function parseClaudeJSONLines(stdout) {
  const changes = [];
  const errors = [];
  const lines = String(stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && obj.type === 'tool_use' && ['Write', 'Replace', 'Edit'].includes(obj.name)) {
        const input = obj.input || {};
        const p = input.path || input.file_path || input.target || 'unknown';
        const content = input.content || input.text || input.code || '';
        changes.push(computeDiffFromContent(p, content));
      }
    } catch (e) {
      // ignore non-JSON lines
    }
  }
  return { changes, errors };
}

function parseClaudeOutput(output) {
  const result = {
    engine: 'claude',
    model: null,
    summary: { title: 'Proposed edits', description: '' },
    changes: [],
    rawOutput: typeof output === 'string' ? output : JSON.stringify(output),
    outputType: 'text'
  };

  // Two modes: json (object/array) or text (json lines)
  if (typeof output === 'string') {
    const fullText = output.trim();
    if (fullText) {
      result.summary.title = fullText;
      result.summary.description = fullText;
    }

    const { changes } = parseClaudeJSONLines(output);
    if (changes.length) {
      result.changes.push(...changes);
      result.outputType = 'json';
    } else {
      // Possibly plain markdown/text from Claude
      result.outputType = /```|^#\s/m.test(output) ? 'markdown' : 'text';
    }
    return result;
  }

  // If we received parsed JSON (e.g., --output-format json), collect tool_use entries
  const items = toArray(output);
  items.forEach((obj) => {
    if (obj && obj.type === 'tool_use' && ['Write', 'Replace', 'Edit'].includes(obj.name)) {
      const input = obj.input || {};
      const p = input.path || input.file_path || input.target || 'unknown';
      const content = input.content || input.text || input.code || '';
      result.changes.push(computeDiffFromContent(p, content));
    }
  });
  if (result.changes.length) result.outputType = 'json';

  const serialized = JSON.stringify(output, null, 2).trim();
  if (serialized) {
    result.summary.title = serialized;
    result.summary.description = serialized;
  }
  return result;
}

module.exports = { parseClaudeOutput };

const fs = require('fs');
const path = require('path');

function countStatsFromPatch(text = '') {
  // Exclude diff headers +++/--- from counts
  const additions = (text.match(/^\+(?!\+\+)/gm) || []).length;
  const deletions = (text.match(/^-(?!---)/gm) || []).length;
  const hunks = (text.match(/@@/g) || []).length;
  return { additions, deletions, hunks };
}

function parseCodexOutput(stdout = '') {
  const result = {
    engine: 'codex',
    model: null,
    summary: { title: 'Proposed code changes', description: '' },
    changes: [],
    rawOutput: stdout,
    outputType: 'text'
  };

  if (typeof stdout !== 'string') return result;

  const fullText = stdout.trim();
  if (!fullText) return result;

  result.summary.title = fullText;
  result.summary.description = fullText;

  // Capture one or multiple *** Begin Patch blocks
  const blocks = [];
  const re = /\*\*\* Begin Patch\s+([\s\S]*?)\*\*\* End Patch/g;
  let m;
  while ((m = re.exec(stdout)) !== null) {
    blocks.push(m[1]);
  }

  if (blocks.length) result.outputType = 'patch';

  blocks.forEach((block) => {
    // Split block by file operations
    const fileOps = block.split(/\n(?=\*\*\* (Add|Update|Delete) File: )/g).filter(Boolean);
    fileOps.forEach((chunk) => {
      const head = chunk.match(/\*\*\* (Add|Update|Delete) File: (.+)/);
      if (!head) return;
      const op = (head[1] || '').toLowerCase();
      const filePath = (head[2] || '').trim();
      const patch = `*** Begin Patch\n${chunk}\n*** End Patch`;
      const stats = countStatsFromPatch(patch);
      result.changes.push({ path: filePath, op, patch, ...stats });
    });
  });

  return result;
}

module.exports = { parseCodexOutput };

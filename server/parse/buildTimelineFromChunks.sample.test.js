// Simple sanity check for buildTimelineFromChunks on a minimal scenario.
// Run manually with: node server/parse/buildTimelineFromChunks.sample.test.js

const assert = require('assert');
const { buildTimelineFromChunks } = require('./index');

// Sample chunks simulating a single CSS edit turn
const chunks = [
  { id: 'c1', type: 'thinking', text: 'Inspecting greet-button background color' },
  { id: 'c2', type: 'run', cmd: 'bash -lc ls' },
  { id: 'c3', type: 'run', cmd: "bash -lc 'rg \"greet-button\" -n || true'" },
  { id: 'c4', type: 'run', cmd: "bash -lc \"sed -n '150,260p' styles.css\"" },
  { id: 'c5', type: 'edit', file: 'styles.css' },
  { id: 'c6', type: 'result', text: 'Updated the Sign Up CTA to the requested background color #3b54a5 (styles.css:187). Refresh the page to see the new styling applied.' }
];

const { summary, timeline } = buildTimelineFromChunks(chunks, {});

// Expect one plan, at least one act command, one edit, one final-message
assert.ok(timeline.find((e) => e.kind === 'plan'), 'missing plan entry');
assert.ok(timeline.find((e) => e.kind === 'command'), 'missing command entry');
assert.ok(timeline.find((e) => e.kind === 'file-change'), 'missing file-change entry');
assert.ok(timeline.find((e) => e.kind === 'final-message'), 'missing final-message entry');

// file-change entry should include styles.css
const edit = timeline.find((e) => e.kind === 'file-change');
assert.ok(edit.files && edit.files.includes('styles.css'), 'file-change should list styles.css');

// Summary fileCount should be 1
assert.strictEqual(summary.meta.fileCount, 1, 'summary.fileCount should be 1');

console.log('buildTimelineFromChunks.sample.test.js passed ✓');


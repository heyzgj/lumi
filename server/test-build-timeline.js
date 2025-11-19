// Minimal script to verify buildTimelineFromChunks using a single-turn sample.
// Run: node server/test-build-timeline.js

const { buildTimelineFromChunks } = require('./parse');

const sampleChunks = [
  { id: 'c1', type: 'thinking', text: 'Inspect background color' },
  { id: 'c2', type: 'run', cmd: 'bash -lc ls' },
  { id: 'c3', type: 'edit', file: 'styles.css' },
  { id: 'c4', type: 'result', text: 'Updated the Sign Up button background to #5064a5 (styles.css:187).' }
];

const built = buildTimelineFromChunks(sampleChunks, { durationMs: 1200 });

console.log(JSON.stringify(built, null, 2));


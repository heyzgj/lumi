
const assert = require('assert');
const { buildTimelineFromChunks, EntryKind, EntryStatus } = require('./parse/index');

// Mock chunks factory
let seq = 0;
const chunk = (type, data = {}) => ({
    type,
    seq: ++seq,
    ts: Date.now(),
    ...data
});

function runTests() {
    console.log('Running Timeline Builder Tests...\n');

    testSimpleFlow();
    testComplexFlow();
    testLogAggregation();
    testConsecutiveEdits();

    console.log('\nAll tests passed! ✅');
}

function testSimpleFlow() {
    console.log('Test: Simple Flow (Thinking -> Run -> Log -> Result)');

    const chunks = [
        chunk('thinking', { text: 'Planning to list files' }),
        chunk('run', { cmd: 'ls -la', id: 'run_1' }),
        chunk('log', { text: 'file1.txt', runId: 'run_1' }),
        chunk('log', { text: 'file2.txt', runId: 'run_1' }),
        chunk('result', { resultSummary: 'Found 2 files' })
    ];

    const { timeline } = buildTimelineFromChunks(chunks);

    assert.strictEqual(timeline.length, 3, 'Should have 3 entries (Thinking, Command, Final)');

    // 1. Thinking
    assert.strictEqual(timeline[0].kind, EntryKind.THINKING || 'thinking');
    assert.strictEqual(timeline[0].title, 'Planning to list files');

    // 2. Command
    assert.strictEqual(timeline[1].kind, EntryKind.COMMAND);
    assert.strictEqual(timeline[1].title, 'ls -la');
    assert.ok(timeline[1].body.includes('file1.txt'), 'Body should contain logs');
    assert.ok(timeline[1].body.includes('file2.txt'), 'Body should contain logs');

    // 3. Final
    assert.strictEqual(timeline[2].kind, EntryKind.FINAL);
    assert.strictEqual(timeline[2].body, 'Found 2 files');

    console.log('  -> Passed');
}

function testComplexFlow() {
    console.log('Test: Complex Flow (Think -> Run(Fail) -> Think -> Edit -> Run(Success))');

    const chunks = [
        chunk('thinking', { text: 'Try reading config' }),
        chunk('run', { cmd: 'cat config.json', id: 'run_1' }),
        chunk('error', { text: 'File not found', runId: 'run_1' }), // Command error
        chunk('thinking', { text: 'Config missing, creating it' }),
        chunk('edit', { file: 'config.json' }),
        chunk('run', { cmd: 'cat config.json', id: 'run_2' }),
        chunk('log', { text: '{}', runId: 'run_2' }),
        chunk('result', { resultSummary: 'Fixed' })
    ];

    const { timeline } = buildTimelineFromChunks(chunks);

    // Expected: Thinking -> Command(Failed) -> Thinking -> Edit -> Command(Success) -> Final
    assert.strictEqual(timeline.length, 6);

    assert.strictEqual(timeline[0].kind, 'thinking');
    assert.strictEqual(timeline[1].kind, EntryKind.COMMAND);
    assert.strictEqual(timeline[1].status, EntryStatus.FAILED);

    assert.strictEqual(timeline[2].kind, 'thinking');
    assert.strictEqual(timeline[2].title, 'Config missing, creating it');

    assert.strictEqual(timeline[3].kind, EntryKind.FILE_CHANGE);
    assert.strictEqual(timeline[3].files[0], 'config.json');

    assert.strictEqual(timeline[4].kind, EntryKind.COMMAND);
    assert.strictEqual(timeline[4].status, EntryStatus.DONE);

    console.log('  -> Passed');
}

function testLogAggregation() {
    console.log('Test: Log Aggregation');

    const chunks = [
        chunk('run', { cmd: 'echo hello' }),
        chunk('log', { text: 'hello' }),
        chunk('log', { text: 'world' }),
        chunk('thinking', { text: 'Next step' }) // Should break aggregation
    ];

    const { timeline } = buildTimelineFromChunks(chunks);

    assert.strictEqual(timeline.length, 2);
    assert.strictEqual(timeline[0].kind, EntryKind.COMMAND);
    assert.ok(timeline[0].body.includes('hello\nworld'));
    assert.strictEqual(timeline[1].kind, 'thinking');

    console.log('  -> Passed');
}

function testConsecutiveEdits() {
    console.log('Test: Consecutive Edits');

    const chunks = [
        chunk('edit', { file: 'a.js' }),
        chunk('edit', { file: 'b.js' }),
        chunk('run', { cmd: 'npm test' })
    ];

    const { timeline } = buildTimelineFromChunks(chunks);

    // Expected: Edit(2 files) -> Command
    assert.strictEqual(timeline.length, 2);
    assert.strictEqual(timeline[0].kind, EntryKind.FILE_CHANGE);
    assert.strictEqual(timeline[0].files.length, 2);
    assert.ok(timeline[0].files.includes('a.js'));
    assert.ok(timeline[0].files.includes('b.js'));

    assert.strictEqual(timeline[1].kind, EntryKind.TEST || EntryKind.COMMAND);

    console.log('  -> Passed');
}

// Run if called directly
if (require.main === module) {
    try {
        runTests();
    } catch (e) {
        console.error('\n❌ Test Failed:', e);
        process.exit(1);
    }
}

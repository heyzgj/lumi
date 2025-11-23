/**
 * Client-side timeline builder for streaming updates
 * Ported from server/parse/index.js to allow real-time UI updates
 */

export const EntryKind = {
    THINKING: 'thinking',
    COMMAND: 'command',
    FILE_CHANGE: 'file-change',
    TEST: 'test',
    FINAL: 'final-message',
    ERROR: 'error'
};

export const EntryStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    DONE: 'done',
    FAILED: 'failed'
};

function cleanText(text = '') {
    if (!text) return '';
    return String(text)
        .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
        .replace(/\*(.*?)\*/g, '$1')     // Italic
        .replace(/`(.*?)`/g, '$1')       // Code
        .trim();
}

/**
 * Build a linear, chronological timeline from Chunk[]
 * @param {Array} chunks raw chunk array
 * @param {Object} timing optional timing info { durationMs?: number }
 * @returns {{ summary: any, timeline: any[] }}
 */
export function buildTimelineFromChunks(chunks = [], timing = {}) {
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
                    title: 'Thinking...',
                    body: cleanText(c.text || c.resultSummary),
                    sourceChunkIds: c.id ? [c.id] : undefined
                });
            }
        } else if (c.type === 'run') {
            // Look ahead for logs/errors associated with this run
            const logs = [];
            let status = EntryStatus.DONE;
            let errorMsg = null;
            let testSummary = null;

            // Consume subsequent logs/errors until next non-log chunk
            let j = i + 1;
            while (j < chunkArray.length) {
                const next = chunkArray[j];
                if (next.type === 'log') {
                    if (next.text) {
                        logs.push(next.text);
                        // Try to extract test summary from logs
                        if (/(\d+)\s+passing/.test(next.text)) {
                            testSummary = next.text.trim();
                        } else if (/(\d+)\s+failing/.test(next.text)) {
                            testSummary = next.text.trim();
                            status = EntryStatus.FAILED;
                        }
                    }
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

            // Refine title/body based on kind
            let title = c.cmd || 'Run command';
            let body = logs.join('\n');

            if (kind === EntryKind.TEST) {
                if (status === EntryStatus.FAILED) {
                    title = 'Tests Failed';
                } else if (testSummary) {
                    title = 'Tests Passed';
                } else {
                    title = 'Ran Tests';
                }
                if (testSummary) {
                    body = testSummary + '\n\n' + body;
                }
            }

            if (errorMsg) {
                body = `${errorMsg}\n${body}`;
            }

            entries.push({
                id: nextId(kind),
                kind,
                status,
                title: cleanText(title),
                body,
                sourceChunkIds: c.id ? [c.id] : undefined
            });

        } else if (c.type === 'edit') {
            // Aggregate consecutive edits
            const files = [];
            const sourceIds = c.id ? [c.id] : [];

            // Process first edit
            files.push({
                path: c.file,
                added: c.added,
                removed: c.removed
            });

            let j = i + 1;
            while (j < chunkArray.length) {
                const next = chunkArray[j];
                if (next.type === 'edit') {
                    files.push({
                        path: next.file,
                        added: next.added,
                        removed: next.removed
                    });
                    if (next.id) sourceIds.push(next.id);
                    j++;
                } else {
                    break;
                }
            }
            i = j - 1;

            const uniqueFiles = Array.from(new Set(files.map(f => f.path).filter(Boolean)));

            let title = '';
            if (uniqueFiles.length === 1) {
                title = `Edited ${uniqueFiles[0]}`;
            } else {
                title = `Edited ${uniqueFiles.length} files`;
            }

            entries.push({
                id: nextId(EntryKind.FILE_CHANGE),
                kind: EntryKind.FILE_CHANGE,
                status: EntryStatus.DONE,
                title,
                files: uniqueFiles,
                details: files, // Keep full details
                sourceChunkIds: sourceIds
            });

        } else if (c.type === 'result') {
            if (c.resultSummary || c.text) {
                entries.push({
                    id: nextId(EntryKind.FINAL),
                    kind: EntryKind.FINAL,
                    status: EntryStatus.DONE,
                    title: 'Result',
                    body: cleanText(c.resultSummary || c.text || ''),
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

    // Title Heuristic - simplified to reduce noise
    let title = null;
    // Only show title if it adds value beyond "Ran command"
    if (hasError) title = 'Execution failed';
    else if (testsStatus === 'failed') title = 'Tests failed';

    const summary = {
        status,
        title: null, // Deprecated in favor of timeline
        meta: {
            durationMs: typeof timing.durationMs === 'number' ? timing.durationMs : undefined,
            testsStatus
        },
        bullets: []
    };

    // Extract bullets from final result or edits
    const finalEntry = entries.findLast(e => e.kind === EntryKind.FINAL);
    if (finalEntry && finalEntry.body) {
        summary.bullets.push(finalEntry.body);
    }

    return { summary, timeline: entries };
}

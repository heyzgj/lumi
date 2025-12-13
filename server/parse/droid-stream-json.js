/**
 * Droid stream-json output parser
 * Parses streaming JSON output from Factory Droid CLI (--output-format stream-json)
 *
 * Droid stream-json event types:
 * - system: { type: 'system', subtype: 'init', cwd, session_id, tools, model }
 * - message: { type: 'message', role: 'user'|'assistant', text, ... }
 * - tool_call: { type: 'tool_call', id, toolName, parameters, ... }
 * - tool_result: { type: 'tool_result', id, isError, value, ... }
 * - completion: { type: 'completion', finalText, numTurns, durationMs, ... }
 * - result: { type: 'result', subtype, result, session_id, ... } (json output format)
 * - error: { type: 'error', message, ... }
 */

function createChunkFactory() {
    let seq = 0;
    return (base) => ({
        ...base,
        seq: ++seq,
        ts: Date.now()
    });
}

function droidEventToChunks(event, stamp) {
    const output = {
        chunks: [],
        aggregatedText: [],
        summary: null
    };

    if (!event || typeof event !== 'object') return output;

    const eventType = event.type;

    // System init event - skip, contains metadata only
    if (eventType === 'system' && event.subtype === 'init') {
        return output;
    }

    // User message - skip, we sent it
    if (eventType === 'message' && event.role === 'user') {
        return output;
    }

    // Assistant message - this is the thinking/response text
    if (eventType === 'message' && event.role === 'assistant') {
        const text = event.text || '';
        if (text) {
            output.chunks.push(
                stamp({ type: 'thinking', text: String(text) })
            );
        }
        return output;
    }

    // Tool call - map to run or edit chunk
    if (eventType === 'tool_call') {
        const toolName = (event.toolName || event.toolId || '').toLowerCase();
        const params = event.parameters || {};

        // Execute/Shell commands -> run chunk
        if (toolName === 'execute' || toolName === 'shell' || toolName === 'bash') {
            const cmd = params.command || params.cmd || JSON.stringify(params);
            output.chunks.push(
                stamp({
                    type: 'run',
                    cmd: String(cmd),
                    runId: event.id || undefined
                })
            );
            return output;
        }

        // File write/edit operations -> edit chunk
        // Droid tools: Edit, ApplyPatch, Create (Write/Replace are Claude style)
        if (/write|edit|replace|create|patch|applypatch/i.test(toolName)) {
            // Try multiple parameter names - different tools use different conventions
            const file = params.file_path
                || params.path
                || params.file
                || params.target
                || params.targetFile
                || params.filename
                || 'unknown';
            output.chunks.push(
                stamp({
                    type: 'edit',
                    file: String(file)
                })
            );
            return output;
        }

        // Read operations -> log chunk
        if (/read|view|cat/i.test(toolName)) {
            const file = params.path || params.file_path || params.file || '';
            output.chunks.push(
                stamp({
                    type: 'log',
                    text: `[Read] ${file}`
                })
            );
            return output;
        }

        // Other tools -> log chunk
        const toolLabel = event.toolName || event.toolId || 'TOOL';
        output.chunks.push(
            stamp({
                type: 'log',
                text: `[${toolLabel}] ${JSON.stringify(params)}`
            })
        );
        return output;
    }

    // Tool result
    if (eventType === 'tool_result') {
        const runId = event.id || undefined;
        const value = event.value || '';

        if (event.isError) {
            output.chunks.push(
                stamp({
                    type: 'error',
                    text: String(value || 'Tool execution failed'),
                    runId
                })
            );
        } else if (value) {
            // Extract meaningful content, limit length
            const lines = String(value).split(/\r?\n/).map(l => l.trimEnd());
            const filtered = lines.filter(l => l.trim()).slice(0, 50);
            if (filtered.length) {
                filtered.forEach((line) => {
                    output.chunks.push(
                        stamp({
                            type: 'log',
                            text: line,
                            runId
                        })
                    );
                    output.aggregatedText.push(line);
                });
            }
        }
        return output;
    }

    // Completion event - final result
    if (eventType === 'completion') {
        const finalText = event.finalText || '';
        if (finalText) {
            output.summary = String(finalText);
            output.chunks.push(
                stamp({
                    type: 'result',
                    resultSummary: output.summary,
                    text: output.summary
                })
            );
        }
        return output;
    }

    // JSON output format result
    if (eventType === 'result') {
        const resultText = event.result || '';
        if (resultText) {
            output.summary = String(resultText);
            output.chunks.push(
                stamp({
                    type: 'result',
                    resultSummary: output.summary,
                    text: output.summary
                })
            );
        }
        if (event.is_error) {
            output.chunks.push(
                stamp({
                    type: 'error',
                    text: String(event.result || 'Droid result error')
                })
            );
        }
        return output;
    }

    // Error event
    if (eventType === 'error') {
        const message = event.message || event.error || 'Droid error';
        output.chunks.push(
            stamp({
                type: 'error',
                text: String(message)
            })
        );
        return output;
    }

    // Unknown event types - fallback log (only if has meaningful content)
    if (event.text || event.message || event.value) {
        output.chunks.push(
            stamp({
                type: 'log',
                text: `[${eventType || 'event'}] ${event.text || event.message || event.value || ''}`
            })
        );
    }

    return output;
}

function parseDroidStreamJson(stdout = '') {
    const lines = String(stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const events = [];
    for (const line of lines) {
        try {
            events.push(JSON.parse(line));
        } catch (_) {
            // Ignore malformed lines
        }
    }

    const stamp = createChunkFactory();
    const chunks = [];
    const aggregated = [];
    let summary = '';

    events.forEach((event) => {
        const partial = droidEventToChunks(event, stamp);
        if (partial.summary && !summary) summary = partial.summary;
        chunks.push(...partial.chunks);
        aggregated.push(...partial.aggregatedText);
    });

    return {
        chunks,
        summary,
        stdout: aggregated.join('\n')
    };
}

module.exports = {
    parseDroidStreamJson,
    droidEventToChunks,
    createChunkFactory
};

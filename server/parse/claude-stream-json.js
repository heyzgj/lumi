function createChunkFactory() {
  let seq = 0;
  return (base) => ({
    ...base,
    seq: ++seq,
    ts: Date.now()
  });
}

function claudeEventToChunks(event, stamp) {
  const output = {
    chunks: [],
    summary: null
  };
  if (!event || typeof event !== 'object') return output;

  if (event.type === 'assistant' && event.message && Array.isArray(event.message.content)) {
    // Claude stream-json (headless) assistant messages
    event.message.content.forEach((block) => {
      if (!block || typeof block !== 'object') return;
      if (block.type === 'thinking' && block.text) {
        output.chunks.push(
          stamp({ type: 'thinking', text: String(block.text) })
        );
        return;
      }
      if (block.type === 'text' && block.text) {
        output.chunks.push(
          stamp({ type: 'log', text: String(block.text) })
        );
        return;
      }
    });
    return output;
  }

  if (event.type === 'message' && Array.isArray(event.content)) {
    event.content.forEach((block) => {
      if (!block || typeof block !== 'object') return;
      if (block.type === 'thinking' && block.text) {
        output.chunks.push(
          stamp({ type: 'thinking', text: String(block.text) })
        );
        return;
      }
      if (block.type === 'text' && block.text) {
        output.chunks.push(
          stamp({ type: 'log', text: String(block.text) })
        );
        return;
      }
      if (block.type === 'tool_use') {
        // Basic mapping: treat known edit tools as edits, otherwise as log.
        const input = block.input || {};
        const file =
          input.path || input.file_path || input.target || input.file || 'unknown';
        const isEdit = /edit|write|replace/i.test(BlockName(block.name));
        if (isEdit) {
          output.chunks.push(
            stamp({
              type: 'edit',
              file
            })
          );
        } else {
          const name = block.name ? `[${block.name}]` : '[TOOL]';
          output.chunks.push(
            stamp({
              type: 'log',
              text: `${name} ${JSON.stringify(input)}`
            })
          );
        }
      }
    });
    return output;
  }

  if (event.type === 'result') {
    const summaryText = event.summary || event.result;
    if (summaryText) {
      output.summary = String(summaryText);
      output.chunks.push(
        stamp({
          type: 'result',
          resultSummary: output.summary,
          text: output.summary
        })
      );
    }
    if (event.error) {
      const message = event.error.message || event.error;
      output.chunks.push(
        stamp({
          type: 'error',
          text: String(message || 'Claude result error')
        })
      );
    }
    return output;
  }

  if (event.type === 'error') {
    output.chunks.push(
      stamp({
        type: 'error',
        text: String(event.error?.message || event.message || 'Claude stream error')
      })
    );
    return output;
  }

  // Unknown event types → fallback log
  output.chunks.push(
    stamp({
      type: 'log',
      text: `[${event.type || 'event'}] ${JSON.stringify(event)}`
    })
  );
  return output;
}

function parseClaudeStreamJson(stdout = '') {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      // Ignore malformed lines; fallback logic handles missing chunks
    }
  }

  const stamp = createChunkFactory();
  const chunks = [];
  let summary = '';

  events.forEach((event) => {
    const partial = claudeEventToChunks(event, stamp);
    if (partial.summary && !summary) summary = partial.summary;
    chunks.push(...partial.chunks);
  });

  return {
    chunks,
    summary
  };
}

function BlockName(name) {
  try { return String(name || ''); } catch (_) { return ''; }
}

module.exports = {
  parseClaudeStreamJson,
  claudeEventToChunks,
  createChunkFactory
};

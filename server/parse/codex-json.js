function createChunkFactory() {
  let seq = 0;
  return (base) => ({
    ...base,
    seq: ++seq,
    ts: Date.now()
  });
}

function codexEventToChunks(event, stamp) {
  const output = {
    chunks: [],
    aggregatedText: [],
    summary: null
  };
  if (!event || typeof event !== 'object') return output;

  if (event.type === 'item.completed' && event.item?.type === 'reasoning') {
    if (event.item.text) {
      output.chunks.push(
        stamp({ type: 'thinking', text: String(event.item.text) })
      );
    }
    return output;
  }

  if (event.type === 'item.started' && event.item?.type === 'command_execution') {
    output.chunks.push(
      stamp({
        type: 'run',
        cmd: String(event.item.command || ''),
        runId: event.item.id || undefined
      })
    );
    return output;
  }

  if (event.type === 'item.completed' && event.item?.type === 'command_execution') {
    const runId = event.item.id || undefined;
    const lines = String(event.item.aggregated_output || '')
      .split(/\r?\n/)
      .map((line) => line.trimEnd());
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || isNoisyLogLine(trimmed)) return;
      output.chunks.push(
        stamp({
          type: 'log',
          text: trimmed,
          runId
        })
      );
      output.aggregatedText.push(trimmed);
    });
    const exitCode = Number(event.item.exit_code);
    if (!Number.isNaN(exitCode) && exitCode !== 0) {
      output.chunks.push(
        stamp({
          type: 'error',
          text: `Command failed with exit code ${exitCode}`,
          runId
        })
      );
    }
    return output;
  }

  if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
    if (event.item.text) {
      output.summary = String(event.item.text);
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

  if (event.type === 'error') {
    const message = event.message || event.error || 'Codex error';
    output.chunks.push(
      stamp({
        type: 'error',
        text: String(message)
      })
    );
    return output;
  }

  return output;
}

function parseCodexJsonOutput(stdout = '') {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      // Ignore malformed lines; fallback logic will handle missing chunks
    }
  }

  const stamp = createChunkFactory();
  const chunks = [];
  const aggregated = [];
  let usage = null;
  let summary = '';

  events.forEach((event) => {
    if (event?.type === 'turn.completed' && event.usage) {
      usage = event.usage;
    }
    const partial = codexEventToChunks(event, stamp);
    if (partial.summary && !summary) summary = partial.summary;
    chunks.push(...partial.chunks);
    aggregated.push(...partial.aggregatedText);
  });

  return {
    chunks,
    usage,
    summary,
    stdout: aggregated.join('\n')
  };
}

function isNoisyLogLine(line = '') {
  const t = String(line).trim();
  if (!t) return true;
  if (/^nvm is not compatible with the "npm_config_prefix"/i.test(t)) return true;
  if (/^Run `unset npm_config_prefix`/i.test(t)) return true;
  if (/^OpenAI Codex v[0-9.]+/i.test(t)) return true;
  if (/^-{4,}$/.test(t)) return true;
  if (/^workdir:/i.test(t)) return true;
  if (/^model:/i.test(t)) return true;
  if (/^provider:/i.test(t)) return true;
  if (/^approval:/i.test(t)) return true;
  if (/^sandbox:/i.test(t)) return true;
  if (/^reasoning effort:/i.test(t)) return true;
  if (/^reasoning summaries:/i.test(t)) return true;
  if (/^session id:/i.test(t)) return true;
  if (/^GET \/health\b/i.test(t)) return true;
  return false;
}

module.exports = {
  parseCodexJsonOutput,
  codexEventToChunks,
  createChunkFactory
};

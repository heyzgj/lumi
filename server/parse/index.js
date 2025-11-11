const { parseCodexOutput } = require('./codex');
const { parseClaudeOutput } = require('./claude');

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

module.exports = { parseToLumiResult };


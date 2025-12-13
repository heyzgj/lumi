/**
 * Droid text output parser
 * Parses text output from Factory Droid CLI
 */

function parseDroidOutput(stdout = '') {
    const result = {
        engine: 'droid',
        model: null,
        summary: { title: 'Proposed changes', description: '' },
        changes: [],
        rawOutput: stdout,
        outputType: 'text'
    };

    if (typeof stdout !== 'string') return result;

    const fullText = stdout.trim();
    if (!fullText) return result;

    result.summary.title = fullText;
    result.summary.description = fullText;

    // Droid may output file edit information in various formats
    // Try to detect common patterns

    // Pattern: file path mentions
    const filePatterns = fullText.match(/(?:created?|updated?|modified?|edited?|wrote)\s+[`']?([^\s`']+\.[a-zA-Z]+)[`']?/gi);
    if (filePatterns && filePatterns.length) {
        filePatterns.forEach((match) => {
            const pathMatch = match.match(/[`']?([^\s`']+\.[a-zA-Z]+)[`']?$/);
            if (pathMatch && pathMatch[1]) {
                result.changes.push({
                    path: pathMatch[1],
                    op: 'update',
                    additions: 0,
                    deletions: 0,
                    hunks: 0
                });
            }
        });
    }

    // Detect output type
    if (/```|^#\s/m.test(fullText)) {
        result.outputType = 'markdown';
    }

    return result;
}

module.exports = { parseDroidOutput };

import { deriveChunksFromText } from '../src/lib/engine/deriveChunksFromText.js';

describe('deriveChunksFromText', () => {
  test('produces clean timeline for Codex final summary + diff', () => {
    const stderr = [
      'thinking',
      '**Preparing final message summary**',
      '',
      'codex',
      'Updated the Sign Up button to use the requested #3d5194 background while leaving other CTAs unchanged (`styles.css:187-189`).  ',
      'Tests not run (not requested).',
      '',
      'file update:',
      'diff --git a/styles.css b/styles.css',
      'index 3a200468f69f2e192fc81b8c565cbb37cb65a9cb..ecf7e081e5ff0ce5eec3503238ad53d873b31732',
      '--- a/styles.css',
      '+++ b/styles.css',
      '@@ -184,6 +184,10 @@',
      '   text-decoration: none;',
      ' }',
      '',
      ' +#greet-button {',
      ' +  background-color: #3d5194;',
      ' +}',
      ' +',
      '  .cta:hover {',
      '    transform: translateY(-2px);',
      '    background: var(--cta-hover);',
      '',
      'tokens used',
      '23,103'
    ].join('\n');

    const stdout = [
      'Updated the Sign Up button to use the requested #3d5194 background while leaving other CTAs unchanged (`styles.css:187-189`).  ',
      'Tests not run (not requested).'
    ].join('\n');

    const chunks = deriveChunksFromText(stdout, stderr);

    // Should have at least one edit chunk pointing at styles.css
    const editStyles = chunks.find((c) => c.type === 'edit' && c.file === 'styles.css');
    expect(editStyles).toBeTruthy();

    // The mechanical "Preparing final message summary" thinking should be filtered out
    const thinkingTexts = chunks.filter((c) => c.type === 'thinking').map((c) => c.text || '');
    expect(thinkingTexts.some((t) => /Preparing final message summary/i.test(t))).toBe(false);

    // There should be a log line containing the human-facing summary text
    const hasSummaryLog = chunks.some(
      (c) =>
        c.type === 'log' &&
        typeof c.text === 'string' &&
        c.text.includes('Updated the Sign Up button to use the requested #3d5194')
    );
    expect(hasSummaryLog).toBe(true);
  });
});

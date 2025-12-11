// Shared helpers for deriving timeline chunks from plain stdout/stderr

export function isNoisyConsoleLine(t) {
  try {
    const s = String(t || '').trim();
    if (!s) return true;
    if (/^nvm is not compatible with the "npm_config_prefix"/i.test(s)) return true;
    if (/^Run `unset npm_config_prefix`/i.test(s)) return true;
    if (/^OpenAI Codex v[0-9.]+/i.test(s)) return true;
    if (/^-{4,}$/.test(s)) return true;
    if (/^workdir:/i.test(s)) return true;
    if (/^model:/i.test(s)) return true;
    if (/^provider:/i.test(s)) return true;
    if (/^approval:/i.test(s)) return true;
    if (/^sandbox:/i.test(s)) return true;
    if (/^reasoning effort:/i.test(s)) return true;
    if (/^reasoning summaries:/i.test(s)) return true;
    if (/^session id:/i.test(s)) return true;
    if (/^GET \/health\b/i.test(s)) return true;
    if (/^Reading prompt from stdin\.\.\./i.test(s)) return true;
    if (/^tokens used$/i.test(s)) return true;
    if (/^Execute completed in \d+ms:/i.test(s)) return true;
    if (/^user$/i.test(s)) return true;
    if (/^\[@(element|screenshot)\d+\]/i.test(s)) return true;
    if (/^#\s+User Intent\b/.test(s)) return true;
    if (/^#\s+Context Reference Map\b/.test(s)) return true;
    if (/^#\s+Detailed Element Context\b/.test(s)) return true;
    if (/^#\s+Instructions\b/.test(s)) return true;
    if (/^#\s+Selection Area\b/.test(s)) return true;
    if (/^##\s+Selected Elements\b/.test(s)) return true;
    if (/^##\s+Screenshots\b/.test(s)) return true;
    if (/^- Page:\s+/i.test(s)) return true;
    if (/^- Title:\s+/i.test(s)) return true;
    if (/^- Selection Mode:\s+/i.test(s)) return true;
    if (/^- \*\*@element[0-9]+\*\*/i.test(s)) return true;
    if (/^- The user's intent may reference tags like /i.test(s)) return true;
    if (/^- Use the Reference Map above/i.test(s)) return true;
    if (/^- Apply changes ONLY to the referenced elements/i.test(s)) return true;
    if (/^- For WYSIWYG edits, apply the exact before→after changes shown/i.test(s)) return true;
    if (/^- Modify files directly; maintain code quality and accessibility/i.test(s)) return true;
    if (/^<details>$/i.test(s)) return true;
    if (/^<\/details>$/i.test(s)) return true;
    if (/^<summary>/.test(s)) return true;
    if (/^<\/summary>/.test(s)) return true;
    if (/^HTML$/.test(s)) return true;
    if (/^Styles$/.test(s)) return true;
    if (/^[{}]$/.test(s)) return true;
    if (/^\"[^"]+\":\s+/.test(s)) return true;
    if (/^[0-9,]+$/.test(s)) return true;
    if (/^```/.test(s)) return true;
    return false;
  } catch (_) {
    return false;
  }
}

export function deriveChunksFromText(stdout = '', stderr = '') {
  const chunks = [];
  const pushLog = (stream, text) => {
    if (text && text.trim()) chunks.push({ type: 'log', stream, text: text.trim() });
  };
  const lines = (String(stderr || '') + '\n' + String(stdout || '')).split(/\r?\n/);
  let expectRunNext = false;
  let thinkingNext = false;
  lines.forEach((raw) => {
    const line = String(raw || '').replace(/\r$/, '');
    const t = line.trim();
    if (!t) return;
    if (isNoisyConsoleLine(t)) return;
    if (/^thinking$/i.test(t)) { thinkingNext = true; return; }
    if (/^exec$/i.test(t)) { expectRunNext = true; return; }
    {
      const diff = t.match(/^diff --git a\/(.+?) b\/(.+)/);
      if (diff && diff[2]) {
        chunks.push({ type: 'edit', file: diff[2].trim() });
        return;
      }
    }
    if (thinkingNext) {
      const m = t.match(/^\*\*(.+)\*\*$/);
      const text = (m && m[1]) ? m[1].trim() : t;
      thinkingNext = false;
      if (/^Preparing final message summary$/i.test(text)) return;
      chunks.push({ type: 'thinking', text });
      return;
    }
    if (expectRunNext) {
      chunks.push({ type: 'run', cmd: t });
      expectRunNext = false;
      return;
    }
    if (/^(bash\s+-lc\s+)/i.test(t)) { chunks.push({ type: 'run', cmd: t }); return; }
    // edit 事件仅在能识别出具体文件时生成；unknown 不进入用户可见 timeline
    if (/^(file update|apply_patch\()/i.test(t)) { return; }
    {
      const m = t.match(/^(M|A|D)\s+(.+)/);
      if (m) { chunks.push({ type: 'edit', file: m[2].trim() }); return; }
    }
    if (/^\*\*\* Begin Patch/.test(t)) { return; }
    pushLog('mixed', t);
  });
  return chunks;
}

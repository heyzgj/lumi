// Minimal Markdown renderer to DOM nodes (safe subset, no HTML injection)
// Supports: headings, paragraphs, code fences, inline code, bold, italic, links, lists

export function renderMarkdown(markdown, doc = document) {
  const frag = doc.createDocumentFragment();
  if (!markdown || typeof markdown !== 'string') return frag;

  const blocks = splitIntoBlocks(markdown);
  blocks.forEach((blk) => {
    if (blk.type === 'code') {
      const pre = doc.createElement('pre');
      pre.className = 'md-code';
      const code = doc.createElement('code');
      if (blk.lang) code.dataset.lang = blk.lang;
      code.textContent = blk.text;
      pre.appendChild(code);
      frag.appendChild(pre);
      return;
    }
    if (blk.type === 'list') {
      const ul = doc.createElement('ul');
      ul.className = 'md-list';
      blk.items.forEach((item) => {
        const li = doc.createElement('li');
        applyInline(li, item, doc);
        ul.appendChild(li);
      });
      frag.appendChild(ul);
      return;
    }
    if (blk.type === 'heading') {
      const level = Math.min(6, Math.max(1, blk.level));
      const el = doc.createElement('h' + level);
      el.className = 'md-h';
      applyInline(el, blk.text, doc);
      frag.appendChild(el);
      return;
    }
    const p = doc.createElement('p');
    p.className = 'md-p';
    applyInline(p, blk.text, doc);
    frag.appendChild(p);
  });
  return frag;
}

function splitIntoBlocks(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block
    const fence = line.match(/^```\s*([a-zA-Z0-9_-]+)?\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      let j = i + 1;
      const buf = [];
      while (j < lines.length && !/^```\s*$/.test(lines[j])) {
        buf.push(lines[j]);
        j++;
      }
      out.push({ type: 'code', lang, text: buf.join('\n') });
      i = j + 1;
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ type: 'heading', level: h[1].length, text: h[2] || '' });
      i++;
      continue;
    }
    // List (only bullets for simplicity)
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      let j = i;
      while (j < lines.length && /^\s*[-*+]\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s*[-*+]\s+/, ''));
        j++;
      }
      out.push({ type: 'list', items });
      i = j;
      continue;
    }
    // Blank lines → paragraph separators
    if (!line.trim()) {
      i++;
      continue;
    }
    // Paragraph: collect until blank line or other block
    const buf = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() && !/^```/.test(lines[j]) && !/^(#{1,6})\s+/.test(lines[j]) && !/^\s*[-*+]\s+/.test(lines[j])) {
      buf.push(lines[j]);
      j++;
    }
    out.push({ type: 'paragraph', text: buf.join('\n') });
    i = j;
  }
  return out;
}

function applyInline(el, text, doc) {
  // Tokenize inline: code `..`, strong **..**, em *..*, links [text](url)
  const tokens = tokenizeInline(text);
  tokens.forEach(t => {
    if (t.type === 'text') {
      el.appendChild(doc.createTextNode(t.value));
    } else if (t.type === 'code') {
      const n = doc.createElement('code');
      n.className = 'md-code-inline';
      n.textContent = t.value;
      el.appendChild(n);
    } else if (t.type === 'strong') {
      const n = doc.createElement('strong');
      n.textContent = t.value;
      el.appendChild(n);
    } else if (t.type === 'em') {
      const n = doc.createElement('em');
      n.textContent = t.value;
      el.appendChild(n);
    } else if (t.type === 'link') {
      const a = doc.createElement('a');
      a.href = t.href;
      a.textContent = t.text || t.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      el.appendChild(a);
    }
  });
}

function tokenizeInline(text) {
  const out = [];
  let i = 0;
  const s = String(text || '');
  while (i < s.length) {
    // code
    if (s[i] === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        out.push({ type: 'code', value: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    // strong **
    if (s[i] === '*' && s[i + 1] === '*') {
      const j = s.indexOf('**', i + 2);
      if (j > i + 2) {
        out.push({ type: 'strong', value: s.slice(i + 2, j) });
        i = j + 2;
        continue;
      }
    }
    // em *
    if (s[i] === '*') {
      const j = s.indexOf('*', i + 1);
      if (j > i + 1) {
        out.push({ type: 'em', value: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    // link [text](url)
    if (s[i] === '[') {
      const j = s.indexOf(']', i + 1);
      if (j > i + 1 && s[j + 1] === '(') {
        const k = s.indexOf(')', j + 2);
        if (k > j + 2) {
          const text = s.slice(i + 1, j);
          const href = s.slice(j + 2, k);
          out.push({ type: 'link', text, href });
          i = k + 1;
          continue;
        }
      }
    }
    // plain
    out.push({ type: 'text', value: s[i] });
    i++;
  }
  return out;
}


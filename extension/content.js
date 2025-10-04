// LUMI content script: selection tools + Bubble UI

(() => {
  if (window.__LUMI_INJECTED__) return; // prevent duplicate
  window.__LUMI_INJECTED__ = true;

  const HIGHLIGHT_STYLE_ID = '__lumi_highlight_style__';
  if (!document.getElementById(HIGHLIGHT_STYLE_ID)) {
    const styleEl = document.createElement('style');
    styleEl.id = HIGHLIGHT_STYLE_ID;
    styleEl.textContent = '.lumi-selected { outline: 2px solid #38bdf8 !important; outline-offset: 2px !important; transition: outline 0.18s ease; }';
    document.documentElement.appendChild(styleEl);
  }

  const state = {
    active: false,
    mode: 'rect', // 'rect' | 'element'
    picking: false, // true while user is selecting
    selection: null,
    shadow: null, // ShadowRoot for overlay
    overlayHost: null,
    bubble: null, // API for bubble
    bubbleHost: null,
    listeners: [],
    setOverlayVisible: (v) => {},
    prevCursor: '',
    prevUserSelect: null,
    bubbleEls: null,
    bubbleWrap: null,
    selectedElement: null,
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'LUMI_START') toggle();
  });

  function toggle() {
    if (state.active) {
      cleanup();
    } else {
      start();
    }
  }

  function start() {
    state.active = true;
    mountOverlay();
    setPicking(true);
  }

  function cleanup() {
    state.active = false;
    document.documentElement.style.cursor = state.prevCursor || '';
    if (state.prevUserSelect) {
      document.documentElement.style.userSelect = state.prevUserSelect.doc || '';
      if (document.body) document.body.style.userSelect = state.prevUserSelect.body || '';
    } else {
      document.documentElement.style.userSelect = '';
      if (document.body) document.body.style.userSelect = '';
    }
    state.prevUserSelect = null;
    state.prevCursor = '';
    // remove overlay host
    try { if (state.overlayHost?.parentNode) state.overlayHost.parentNode.removeChild(state.overlayHost); } catch {}
    state.shadow = null; state.overlayHost = null;
    // remove bubble host
    try { if (state.bubbleHost?.parentNode) state.bubbleHost.parentNode.removeChild(state.bubbleHost); } catch {}
    state.bubble = null; state.bubbleHost = null; state.bubbleEls = null; state.bubbleWrap = null;
    if (state.selectedElement) {
      try { state.selectedElement.classList.remove('lumi-selected'); } catch {}
    }
    state.selectedElement = null;
    // remove all event listeners we added on window/document
    for (const { target, type, handler, opts } of state.listeners) {
      try { target.removeEventListener(type, handler, opts); } catch {}
    }
    state.listeners = [];
  }

  function mountOverlay() {
    const host = document.createElement('div');
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .overlay { position: fixed; inset: 0; pointer-events: none; }
      .mask { position: absolute; inset: 0; background: rgba(2,6,23,0.25); pointer-events:none; }
      .rect { position: absolute; border: 2px solid rgba(56,189,248,0.9); background: rgba(56,189,248,0.12); border-radius: 12px; box-shadow: 0 12px 30px rgba(2,6,23,0.35); pointer-events:none; }
      .hint { position: fixed; left: 12px; bottom: 12px; background: #111; color:#fff; font: 12px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto; padding:8px 10px; border-radius:8px; opacity:0.9; }
      .pick { outline: 2px solid rgba(56,189,248,0.95) !important; outline-offset: 3px !important; transition: outline 0.18s ease; }
    `;
    shadow.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const mask = document.createElement('div');
    mask.className = 'mask';
    const rect = document.createElement('div');
    rect.className = 'rect';
    overlay.appendChild(mask);
    overlay.appendChild(rect);
    shadow.appendChild(overlay);

    document.documentElement.appendChild(host);
    state.shadow = shadow;
    state.overlayHost = host;

    let startX = 0, startY = 0, dragging = false;
    const onDown = (e) => {
      if (!state.active || !state.picking || state.mode !== 'rect') return;
      if (isFromBubble(e)) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      rect.style.display = 'block';
      rect.style.left = startX + 'px';
      rect.style.top = startY + 'px';
      rect.style.width = '0px';
      rect.style.height = '0px';
    };
    const onMove = (e) => {
      if (!dragging || state.mode !== 'rect' || !state.picking) return;
      e.preventDefault();
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      rect.style.left = x + 'px';
      rect.style.top = y + 'px';
      rect.style.width = w + 'px';
      rect.style.height = h + 'px';
    };
    const onUp = (e) => {
      if (!dragging || state.mode !== 'rect' || !state.picking) return;
      dragging = false;
      const bbox = rect.getBoundingClientRect();
      const label = formatRectLabel(bbox);
      state.selection = { type: 'rect', bbox: { x: bbox.left, y: bbox.top, width: bbox.width, height: bbox.height }, scroll: { x: window.scrollX, y: window.scrollY }, pageURL: location.href, label };
      setPicking(false);
      showBubble(bbox);
    };

    // element pick mode
    let lastPick;
    const onHover = (e) => {
      if (!state.active || state.mode !== 'element' || !state.picking) return;
      if (isFromBubble(e)) return;
      const el = e.target.closest('*');
      if (lastPick && lastPick !== el) lastPick.classList.remove('pick');
      if (el) el.classList.add('pick');
      lastPick = el;
    };
    const onClickPick = (e) => {
      if (!state.active || state.mode !== 'element' || !state.picking) return;
      if (isFromBubble(e)) return;
      e.preventDefault(); e.stopPropagation();
      const el = e.target.closest('*');
      if (!el) return;
      const r = el.getBoundingClientRect();
      const label = formatElementLabel(el);
      if (state.selectedElement && state.selectedElement !== el) {
        try { state.selectedElement.classList.remove('lumi-selected'); } catch {}
      }
      state.selectedElement = el;
      el.classList.add('lumi-selected');
      state.selection = { type: 'element', selector: getDomPath(el), bbox: { x: r.left, y: r.top, width: r.width, height: r.height }, pageURL: location.href, scroll: { x: window.scrollX, y: window.scrollY }, html: el.outerHTML, styleSummary: summarizeComputedStyle(el), label };
      setPicking(false);
      showBubble(r);
      if (lastPick) { try { lastPick.classList.remove('pick'); } catch {} }
    };

    addL('mousedown', onDown, true);
    addL('mousemove', onMove, true);
    addL('mouseup', onUp, true);
    addL('mousemove', onHover, true);
    addL('click', onClickPick, true);

    addDL('keydown', onKeyDown);

    function onKeyDown(e) {
      if (!state.active) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    }

    function placeBubbleNear(bbox) {
      showBubble(bbox);
    }

    function isFromBubble(e) {
      if (!state.bubbleHost) return false;
      const p = e.composedPath ? e.composedPath() : [];
      return p.includes(state.bubbleHost) || state.bubbleHost.contains(e.target);
    }

    function setOverlayVisible(v) {
      mask.style.display = v ? 'block' : 'none';
      if (!v) rect.style.display = 'none';
    }
    state.setOverlayVisible = setOverlayVisible;
    setOverlayVisible(true);

    // reposition bubble on scroll/resize
    function onRelayout() {
      if (!state.active || !state.selection || !state.bubble) return;
      let bbox = state.selection.bbox;
      if (state.selection.type === 'element' && state.selection.selector) {
        const el = document.querySelector(state.selection.selector);
        if (el) bbox = el.getBoundingClientRect();
      }
      if (bbox) placeBubbleNear(bbox);
    }
    window.addEventListener('scroll', onRelayout, true);
    window.addEventListener('resize', onRelayout, true);
    function addL(type, handler, useCapture) { window.addEventListener(type, handler, useCapture); state.listeners.push({ target: window, type, handler, opts: useCapture }); }
    function addDL(type, handler) { document.addEventListener(type, handler); state.listeners.push({ target: document, type, handler, opts: false }); }
  }

  function mountBubble() {
    if (state.bubble) return state.bubble;

    const host = document.createElement('div');
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.left = '20px';
    host.style.top = '20px';
    host.style.zIndex = '2147483647';
    host.style.display = 'none';
    const shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
    state.bubbleHost = host;

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial }
      .bubble { width: 340px; max-width: 360px; color: #e2e8f0; background: rgba(15,23,42,0.94); backdrop-filter: saturate(140%) blur(12px); border: 1px solid rgba(148,163,184,0.2); border-radius: 16px; box-shadow: 0 20px 45px rgba(2,6,23,0.38); font: 13px/1.45 system-ui, -apple-system, Segoe UI, Roboto; overflow: hidden; transform: translateY(8px) scale(0.97); opacity: 0; transition: transform 0.18s ease, opacity 0.18s ease; }
      .bubble.show { transform: translateY(0) scale(1); opacity: 1; }
      .hdr { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom: 1px solid rgba(15,23,42,0.06); }
      .title { font-weight:600; font-size:13px; flex:1; }
      .dot { width:8px; height:8px; border-radius:999px; background:#aaa; }
      .row { display:flex; gap:8px; align-items:center; }
      select, button, textarea { font: inherit; }
      select { padding:6px 8px; border-radius:8px; border:1px solid rgba(148,163,184,0.25); background:rgba(30,41,59,0.85); color:#e2e8f0; }
      .tools button { width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid rgba(148,163,184,0.25); background:rgba(30,41,59,0.85); color:#e2e8f0; cursor:pointer; transition: background 0.15s ease, border 0.15s ease; }
      .tools button.active { background:#38bdf8; color:#0f172a; border-color:#38bdf8; box-shadow: 0 0 0 1px rgba(56,189,248,0.35); }
      .meta { padding:6px 12px 4px 12px; color:#94a3b8; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; }
      .body { padding:10px 12px; display:flex; gap:10px; }
      .thumb { width:72px; height:72px; background:#f1f5f9; border:1px solid rgba(15,23,42,0.06); border-radius:10px; flex: none; display:flex; align-items:center; justify-content:center; overflow:hidden; }
      .thumb[hidden] { display: none; }
      textarea { width:100%; height:72px; resize:vertical; min-height:60px; max-height:180px; padding:8px 10px; border-radius:12px; border:1px solid rgba(148,163,184,0.2); background:rgba(15,23,42,0.85); color:#e2e8f0; }
      .ftr { padding:10px 12px; display:flex; gap:8px; justify-content:flex-end; border-top:1px solid rgba(15,23,42,0.06); }
      .btn { padding:8px 16px; border-radius:12px; border:1px solid rgba(56,189,248,0.35); background:#38bdf8; color:#0f172a; font-weight:600; cursor:pointer; transition: filter 0.15s ease; }
      .btn:hover:not([disabled]) { filter: brightness(1.08); }
      .btn[disabled] { opacity:0.5; cursor:not-allowed; filter:none; }
      .muted { color:#94a3b8; font-size:12px; }
      .toast { position: fixed; right: 8px; bottom: 8px; background:#111; color:#fff; padding:8px 10px; border-radius:8px; opacity:0.92 }
    `;
    shadow.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'bubble';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'LUMI Editor');
    wrap.innerHTML = `
      <div class="hdr">
        <div class="title">LUMI</div>
        <div class="row">
          <select id="engine" aria-label="Engine">
            <option value="codex">Codex CLI</option>
            <option value="claude">Claude Code (CLI)</option>
          </select>
          <div class="dot" id="status"></div>
        </div>
        <div class="tools row">
          <button id="modeRect" title="Screenshot" aria-label="Screenshot mode">🖼</button>
          <button id="modeEl" title="Element" aria-label="Element mode">⌘</button>
          <button id="close" title="Close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="meta"><span id="selectionLabel">Awaiting selection…</span></div>
      <div class="body">
        <div class="thumb" aria-hidden="true" id="thumbWrap" hidden><canvas id="thumb" width="72" height="72"></canvas></div>
        <textarea id="prompt" placeholder="Describe the change…" aria-label="Instructions"></textarea>
      </div>
      <div class="ftr">
        <div class="muted" id="hint">Screenshot mode — drag to select.</div>
        <button class="btn" id="run" aria-label="Run">Run</button>
      </div>
    `;
    shadow.appendChild(wrap);
    state.bubbleWrap = wrap;

    const api = {
      setPos(x, y) {
        host.style.left = Math.round(x) + 'px';
        host.style.top = Math.round(y) + 'px';
        adjustPosition();
      }
    };
    state.bubble = api;

    const el = {
      engine: shadow.getElementById('engine'),
      status: shadow.getElementById('status'),
      modeRect: shadow.getElementById('modeRect'),
      modeEl: shadow.getElementById('modeEl'),
      close: shadow.getElementById('close'),
      prompt: shadow.getElementById('prompt'),
      run: shadow.getElementById('run'),
      thumbWrap: shadow.getElementById('thumbWrap'),
      thumb: shadow.getElementById('thumb'),
      hint: shadow.getElementById('hint'),
      label: shadow.getElementById('selectionLabel')
    };
    state.bubbleEls = el;

    chrome.runtime.sendMessage({ type: 'LUMI_GET_SETTINGS' }, (res) => {
      if (res?.ok && res.settings?.engine) el.engine.value = res.settings.engine;
    });

    function setMode(mode) {
      state.mode = mode;
      if (mode === 'rect') {
        el.modeRect.classList.add('active');
        el.modeEl.classList.remove('active');
        el.hint.textContent = 'Screenshot mode — drag to select.';
      } else {
        el.modeEl.classList.add('active');
        el.modeRect.classList.remove('active');
        el.hint.textContent = 'Element mode — click a component.';
      }
    }

    el.modeRect.addEventListener('click', () => {
      setMode('rect');
      setPicking(true);
    });
    el.modeEl.addEventListener('click', () => {
      setMode('element');
      setPicking(true);
    });
    el.close.addEventListener('click', () => cleanup());

    el.run.addEventListener('click', submit);
    el.prompt.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    shadow.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = shadow.querySelectorAll('button, [href], select, textarea, input, [tabindex]:not([tabindex="-1"])');
      const list = Array.from(focusables).filter((n) => !n.hasAttribute('disabled'));
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    pingHost().catch(() => {});

    async function pingHost() {
      setStatus('pending');
      try {
        const r = await sendBg({ type: 'LUMI_HOST_PING' });
        if (r?.ok) setStatus('ok'); else setStatus('err');
      } catch { setStatus('err'); }
    }

    function setStatus(s) {
      const colors = { ok: '#22c55e', err: '#ef4444', pending: '#f59e0b' };
      el.status.style.background = colors[s] || '#aaa';
    }

    async function submit() {
      if (!state.selection) { toast('Select a region or element first.'); return; }
      const prompt = el.prompt.value.trim();
      if (!prompt) { toast('Please enter instructions.'); return; }

      el.run.disabled = true; setStatus('pending'); el.hint.textContent = 'Running…';
      await chrome.runtime.sendMessage({ type: 'LUMI_SAVE_SETTINGS', settings: { engine: el.engine.value } });

      const screenshot = await captureAndCrop(state.selection);
      drawThumb(screenshot);

      const payload = buildPayload(prompt, state.selection, screenshot, el.engine.value);
      try {
        const r = await sendBg({ type: 'LUMI_HOST_SEND', payload });
        if (!r?.ok) throw new Error(r?.error || 'Host error');
        const resp = r.response || {};
        setStatus(resp.ok ? 'ok' : 'err');
        el.hint.textContent = resp.message || (resp.ok ? 'Success — close or choose another selection.' : 'Failed');
        if (resp.diffSummary) toast('Applied patch: ' + resp.diffSummary);
      } catch (e) {
        setStatus('err');
        el.hint.textContent = 'Error: ' + e.message;
        toast('Error: ' + e.message);
      } finally {
        el.run.disabled = false;
      }
    }

    function drawThumb(dataUrl) {
      try {
        const ctx = el.thumb.getContext('2d');
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0,0,72,72);
          const scale = Math.min(72/img.width, 72/img.height);
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          ctx.drawImage(img, (72-w)/2, (72-h)/2, w, h);
          el.thumbWrap.hidden = false;
        };
        img.src = dataUrl;
      } catch {}
    }

    function toast(text) {
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = text;
      shadow.appendChild(t);
      setTimeout(() => t.remove(), 1800);
    }

    function adjustPosition() {
      const br = host.getBoundingClientRect();
      let nx = br.left;
      let ny = br.top;
      if (br.right > window.innerWidth - 12) nx = Math.max(12, window.innerWidth - br.width - 12);
      if (br.bottom > window.innerHeight - 12) ny = Math.max(12, window.innerHeight - br.height - 12);
      if (br.left < 12) nx = 12;
      if (br.top < 12) ny = 12;
      host.style.left = Math.round(nx) + 'px';
      host.style.top = Math.round(ny) + 'px';
    }

    setMode(state.mode || 'rect');
    return state.bubble;
  }


  async function captureAndCrop(sel) {
    const r = await sendBg({ type: 'LUMI_CAPTURE_VISIBLE' });
    if (!r?.ok) throw new Error(r?.error || 'capture failed');
    const dataUrl = r.dataUrl;
    return await cropDataUrl(dataUrl, sel.bbox);
  }

  async function cropDataUrl(dataUrl, bbox) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bbox.width * scaleX));
        c.height = Math.max(1, Math.round(bbox.height * scaleY));
        const ctx = c.getContext('2d');
        ctx.drawImage(
          img,
          Math.round(bbox.left * scaleX || bbox.x * scaleX),
          Math.round(bbox.top * scaleY || bbox.y * scaleY),
          Math.round(bbox.width * scaleX),
          Math.round(bbox.height * scaleY),
          0, 0, c.width, c.height
        );
        const out = c.toDataURL('image/png');
        resolve(out);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function summarizeComputedStyle(el) {
    const cs = getComputedStyle(el);
    const keys = ['display','position','top','left','right','bottom','width','height','margin','padding','color','background-color','font-size','font-weight','line-height','border','border-radius'];
    const out = {};
    for (const k of keys) out[k] = cs.getPropertyValue(k);
    return out;
  }

  function getDomPath(el) {
    const stack = [];
    while (el && el.nodeType === 1 && stack.length < 8) {
      let sibCount = 0, sibIndex = 0;
      for (let sib = el.previousSibling; sib; sib = sib.previousSibling) {
        if (sib.nodeType === 1 && sib.nodeName === el.nodeName) sibCount++;
      }
      for (let sib = el.nextSibling; sib; sib = sib.nextSibling) {
        if (sib.nodeType === 1 && sib.nodeName === el.nodeName) sibIndex++;
      }
      const nodeName = el.nodeName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const nth = sibCount ? `:nth-of-type(${sibCount + 1})` : '';
      stack.unshift(`${nodeName}${id}${nth}`);
      el = el.parentElement;
    }
    return stack.join(' > ');
  }

function buildPayload(prompt, selection, screenshotDataUrl, engine) {
  const imageBase64 = screenshotDataUrl?.split(',')[1] || null;
  return {
    action: 'APPLY_PROMPT',
    engine: engine || 'codex',
    selection,
    prompt,
    screenshot: imageBase64,
  };
}

function sendBg(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function ensureBubble() {
  if (!state.bubble) mountBubble();
  return state.bubble;
}

function formatRectLabel(bbox) {
  const w = Math.max(1, Math.round(bbox?.width ?? 0));
  const h = Math.max(1, Math.round(bbox?.height ?? 0));
  return `Screenshot • ${w}×${h}px`;
}

function formatElementLabel(el) {
  if (!el) return 'Element selection';
  const tag = el.tagName ? el.tagName.toLowerCase() : 'element';
  const id = el.id ? `#${el.id}` : '';
  const classes = el.classList ? Array.from(el.classList).slice(0, 2).map(c => `.${c}`).join('') : '';
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
  const snippet = text ? ` — "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"` : '';
  return `Element • ${tag}${id}${classes}${snippet}`;
}

function computeBubblePosition(bbox) {
  const left = bbox?.left ?? bbox?.x ?? 12;
  const top = bbox?.top ?? bbox?.y ?? 12;
  const width = bbox?.width ?? 0;
  const height = bbox?.height ?? 0;
  let x = left + width + 12;
  let y = top + height + 12;
  // prefer below-right; if extends beyond right edge, try left side
  const bubbleWidth = (state.bubbleHost?.offsetWidth || 340);
  if (x + bubbleWidth > window.innerWidth - 12) {
    x = Math.max(12, left - bubbleWidth - 12);
  }
  // if extends beyond bottom, try above
  const bubbleHeight = (state.bubbleHost?.offsetHeight || 180);
  if (y + bubbleHeight > window.innerHeight - 12) {
    y = Math.max(12, top - bubbleHeight - 12);
  }
  return { x, y };
}

function showBubble(bbox) {
  const bubble = ensureBubble();
  if (!bubble) return;
  const host = state.bubbleHost;
  const { x, y } = computeBubblePosition(bbox);
  host.style.display = 'block';
  bubble.setPos(x, y);
  const el = state.bubbleEls;
  if (el?.label) el.label.textContent = state.selection?.label || 'Selection ready';
  if (el?.hint) el.hint.textContent = 'Describe the change, then press Run.';
  if (state.bubbleWrap) state.bubbleWrap.classList.add('show');
  if (el?.prompt) setTimeout(() => { el.prompt.focus(); }, 10);
}

function hideBubble() {
  if (state.bubbleHost) state.bubbleHost.style.display = 'none';
  if (state.bubbleWrap) state.bubbleWrap.classList.remove('show');
}

function setPicking(v) {
  state.picking = v;
  if (v) {
    if (state.selectedElement) {
      try { state.selectedElement.classList.remove('lumi-selected'); } catch {}
      state.selectedElement = null;
    }
    state.selection = null;
    state.setOverlayVisible(true);
    state.prevCursor = document.documentElement.style.cursor;
    state.prevUserSelect = {
      doc: document.documentElement.style.userSelect,
      body: document.body ? document.body.style.userSelect : null,
    };
    document.documentElement.style.cursor = 'crosshair';
    document.documentElement.style.userSelect = 'none';
    if (document.body) document.body.style.userSelect = 'none';
    hideBubble();
    if (state.bubbleEls?.label) state.bubbleEls.label.textContent = state.mode === 'element'
      ? 'Element mode — click to select.'
      : 'Screenshot mode — drag to select.';
    if (state.bubbleEls?.hint) state.bubbleEls.hint.textContent = state.mode === 'element'
      ? 'Click an element to capture context.'
      : 'Drag to capture a screenshot region.';
  } else {
    state.setOverlayVisible(false);
    document.documentElement.style.cursor = state.prevCursor || '';
    if (state.prevUserSelect) {
      document.documentElement.style.userSelect = state.prevUserSelect.doc || '';
      if (document.body) document.body.style.userSelect = state.prevUserSelect.body || '';
    }
  }
}

})();

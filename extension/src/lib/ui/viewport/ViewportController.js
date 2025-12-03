import RestoreHelper from './RestoreHelper.js';

const TOPBAR_HEIGHT = 56;
const TOPBAR_MARGIN = 12;
const SCALE_MIN = 0.25;
const SCALE_MAX = 2;

const PRESETS = {
  responsive: { width: 1280, height: 800 },
  mobile: { width: 428, height: 926 },   // iPhone 16 Pro Max
  pad: { width: 1024, height: 1366 },    // iPad Pro 12.9
  laptop: { width: 1280, height: 800 }   // MacBook Air
};

export default class ViewportController {
  constructor(eventBus, stateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.enabled = false;

    this.root = null;
    this.canvas = null;
    this.stageFrame = null;
    this.contentWrapper = null; // Actual DOM container (inline mode)
    this.anchor = null;
    this.iframe = null;

    this.stageMode = 'inline';
    this.stageFallback = 'none';

    this.restoreHelper = new RestoreHelper();
    this.htmlPrevStyle = null;
    this.bodyPrevStyle = null;
    this.stylesSaved = false;

    this._listeners = [];
    this._iframeFallbackTimer = null;
  }

  init() {
    this.eventBus.on('viewport:toggle', (enabled) => this.setEnabled(!!enabled));
    this.eventBus.on('viewport:preset', (name) => this.setPreset(name));
    this.eventBus.on('viewport:fit', (mode) => this.setFit(mode));
    this.eventBus.on('viewport:scale', (value) => this.setScale(value));
    this.eventBus.on('viewport:zoom', (value) => this.setZoom(value));
    this.eventBus.on('viewport:resize', (payload) => this.setLogical(payload));

    try {
      this.stateManager.subscribe('ui.viewport.mode', () => this.layout());
      this.stateManager.subscribe('ui.viewport.scale', () => this.layout());
      this.stateManager.subscribe('ui.viewport.logical', () => this.layout());
      this.stateManager.subscribe('ui.dockWidth', () => this.layout());
      this.stateManager.subscribe('ui.dockOpen', () => this.layout());
      this.stateManager.subscribe('ui.viewport.useIframeStage', () => {
        if (!this.enabled) return;
        this.applyStageMode(true);
      });
    } catch (_) { }
  }

  getStageInfo() {
    return {
      mode: this.stageMode,
      fallback: this.stageFallback,
      enabled: this.enabled
    };
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.stateManager.set('ui.viewport.enabled', enabled);
    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.restoreHelper.saveScroll();
    this.saveInlineStyles();
    this.mountViewport();
    this.registerListeners();
    this.applyStageMode(true);
    this.layout();
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.unregisterListeners();

    const wrapper = this.contentWrapper;
    const root = this.root;
    const anchor = this.anchor;

    this.teardownIframe();
    this.contentWrapper = null;
    this.stageFrame = null;
    this.canvas = null;
    this.root = null;
    this.anchor = null;
    this.stageMode = 'inline';
    this.stageFallback = 'none';

    this.restoreHelper.restoreOriginalPage(wrapper, root, anchor);
    this.restoreInlineStyles();
  }

  saveInlineStyles() {
    if (this.stylesSaved) return;
    const html = document.documentElement;
    const body = document.body;
    this.htmlPrevStyle = html.getAttribute('style');
    this.bodyPrevStyle = body.getAttribute('style');
    this.stylesSaved = true;
  }

  restoreInlineStyles() {
    if (!this.stylesSaved) return;
    const html = document.documentElement;
    const body = document.body;
    if (this.htmlPrevStyle === null) html.removeAttribute('style'); else html.setAttribute('style', this.htmlPrevStyle);
    if (this.bodyPrevStyle === null) body.removeAttribute('style'); else body.setAttribute('style', this.bodyPrevStyle);
    this.stylesSaved = false;
  }

  mountViewport() {
    if (this.root) return;
    const body = document.body;

    const anchor = document.createElement('div');
    anchor.id = 'lumi-viewport-anchor';
    anchor.style.cssText = 'display:none!important;';
    body.insertBefore(anchor, body.firstChild);
    this.anchor = anchor;

    const root = document.createElement('div');
    root.id = 'lumi-viewport-root';
    body.appendChild(root);

    const canvas = document.createElement('div');
    canvas.id = 'lumi-viewport-canvas';
    canvas.style.cssText = 'position:absolute; inset:0; overflow:auto; pointer-events:auto;';
    root.appendChild(canvas);

    const stageFrame = document.createElement('div');
    stageFrame.id = 'lumi-viewport-stage';
    stageFrame.style.cssText = 'position:absolute; top:0; left:0; transform-origin: top left;';
    canvas.appendChild(stageFrame);

    const inlineWrapper = document.createElement('div');
    inlineWrapper.id = 'lumi-viewport-inline';
    inlineWrapper.style.cssText = 'position:relative; width:100%; height:100%;';
    stageFrame.appendChild(inlineWrapper);

    this.root = root;
    this.canvas = canvas;
    this.stageFrame = stageFrame;
    this.contentWrapper = inlineWrapper;

    this.wrapDom();
  }

  wrapDom() {
    if (!this.contentWrapper) return;
    const body = document.body;
    let child = body.firstChild;
    while (child) {
      const next = child.nextSibling;
      if (this.shouldMoveNode(child)) {
        this.contentWrapper.appendChild(child);
      }
      child = next;
    }
  }

  shouldMoveNode(node) {
    if (!node) return false;
    if (node === this.anchor) return false;
    if (node.id && node.id.startsWith('lumi-')) return false;
    if (node.nodeType === Node.COMMENT_NODE) return false;
    return true;
  }

  registerListeners() {
    this.unregisterListeners();
    this._listeners = [];
    const add = (target, event, handler, options) => {
      if (!target || !handler) return;
      target.addEventListener(event, handler, options);
      this._listeners.push(() => target.removeEventListener(event, handler, options));
    };

    this._onResize = () => this.layout();
    add(window, 'resize', this._onResize, { passive: true });

    this._onCanvasScroll = () => this.eventBus.emit('viewport:scrolled');
    add(this.canvas, 'scroll', this._onCanvasScroll, { passive: true });

    this._onWheel = (e) => {
      if (!this.canvas) return;
      if (e.ctrlKey) {
        const current = this.stateManager.get('ui.viewport.scale') || 1;
        const factor = Math.exp(-e.deltaY * 0.002);
        const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, current * factor));
        const rect = this.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left + this.canvas.scrollLeft;
        const cy = e.clientY - rect.top + this.canvas.scrollTop;
        const contentX = cx / current;
        const contentY = cy / current;
        this.setZoom(next);
        const nx = contentX * next;
        const ny = contentY * next;
        this.canvas.scrollLeft = Math.max(0, nx - (e.clientX - rect.left));
        this.canvas.scrollTop = Math.max(0, ny - (e.clientY - rect.top));
        e.preventDefault();
      } else if (e.shiftKey) {
        this.canvas.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    add(this.canvas, 'wheel', this._onWheel, { passive: false });

    this._dragging = false;
    this._dragLast = { x: 0, y: 0 };

    this._onPointerDown = (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      if (this.isSpacePressed()) {
        this._dragging = true;
        this._dragLast = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
        e.preventDefault();
      }
    };
    this._onPointerMove = (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._dragLast.x;
      const dy = e.clientY - this._dragLast.y;
      this._dragLast = { x: e.clientX, y: e.clientY };
      this.canvas.scrollLeft -= dx;
      this.canvas.scrollTop -= dy;
    };
    this._onPointerUp = () => {
      if (!this._dragging) return;
      this._dragging = false;
      this.canvas.style.cursor = '';
    };
    add(this.canvas, 'pointerdown', this._onPointerDown, { passive: false });
    add(window, 'pointermove', this._onPointerMove, { passive: true });
    add(window, 'pointerup', this._onPointerUp, { passive: true });
  }

  unregisterListeners() {
    if (!this._listeners) return;
    this._listeners.forEach((dispose) => {
      try { dispose(); } catch (_) { }
    });
    this._listeners = [];
    this._dragging = false;
    if (this.canvas) this.canvas.style.cursor = '';
  }

  applyStageMode(force = false) {
    const useIframe = !!this.stateManager.get('ui.viewport.useIframeStage');
    const desired = useIframe ? 'iframe' : 'inline';
    if (!force && desired === this.stageMode && (desired !== 'iframe' || this.stageFallback === 'none')) return;
    if (desired === 'iframe') {
      this.mountIframeStage();
    } else {
      this.mountInlineStage();
    }
  }

  mountInlineStage(fallback = 'none') {
    this.stageMode = 'inline';
    this.stageFallback = fallback;
    this.teardownIframe();
    if (this.contentWrapper) this.contentWrapper.style.display = 'block';
  }

  mountIframeStage() {
    if (!this.stageFrame) return;
    if (!this.contentWrapper) return;
    this.contentWrapper.style.display = 'none';
    this.teardownIframe();
    if (this._iframeFallbackTimer) {
      clearTimeout(this._iframeFallbackTimer);
      this._iframeFallbackTimer = null;
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'lumi-viewport-iframe';
    iframe.name = 'lumi-viewport-iframe';
    iframe.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border:0; background:#fff;';
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-pointer-lock');
    this.stageFrame.appendChild(iframe);
    this.iframe = iframe;
    this.stageMode = 'iframe';
    this.stageFallback = 'pending';

    // Track emulation state to prevent infinite reload loop
    let emulationApplied = false;

    console.log('[LUMI] mounting iframe stage...');

    // Show a lightweight loader overlay for smoothness
    const loader = document.createElement('div');
    loader.id = 'lumi-viewport-loading';
    loader.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none;';
    const spinner = document.createElement('div');
    spinner.style.cssText = 'width:20px;height:20px;border-radius:10px;border:2px solid rgba(0,0,0,0.15);border-top-color: rgba(0,0,0,0.45);animation: lumi-spin 0.8s linear infinite;';
    loader.appendChild(spinner);
    const style = document.createElement('style');
    style.textContent = '@keyframes lumi-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
    loader.appendChild(style);
    this.stageFrame.appendChild(loader);

    this._iframeFallbackTimer = setTimeout(() => this.handleIframeFallback('timeout'), 2000);
    iframe.addEventListener('load', () => {
      if (!iframe.contentWindow || !iframe.contentDocument) {
        this.handleIframeFallback('noContentWindow');
        return;
      }
      if (this._iframeFallbackTimer) {
        clearTimeout(this._iframeFallbackTimer);
        this._iframeFallbackTimer = null;
      }
      this.stageFallback = 'none';

      // Debug: Verify iframe viewport behavior
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      console.group('[LUMI DEBUG] Iframe Viewport Analysis');
      console.log('📐 Iframe element dimensions:');
      console.log('  iframe.offsetWidth:', iframe.offsetWidth);
      console.log('  iframe.offsetHeight:', iframe.offsetHeight);
      console.log('  iframe.clientWidth:', iframe.clientWidth);
      console.log('  iframe.clientHeight:', iframe.clientHeight);
      console.log('');
      console.log('🪟 Window inside iframe:');
      console.log('  window.innerWidth:', win.innerWidth);
      console.log('  window.innerHeight:', win.innerHeight);
      console.log('  window.outerWidth:', win.outerWidth);
      console.log('  window.outerHeight:', win.outerHeight);
      console.log('');
      console.log('📄 Document inside iframe:');
      console.log('  document.documentElement.clientWidth:', doc.documentElement.clientWidth);
      console.log('  document.documentElement.clientHeight:', doc.documentElement.clientHeight);
      console.log('  document.body.clientWidth:', doc.body?.clientWidth);
      console.log('  document.body.clientHeight:', doc.body?.clientHeight);
      console.log('');
      console.log('📱 Viewport Meta Tag:');
      const vpMeta = doc.querySelector('meta[name="viewport"]');
      console.log('  exists:', !!vpMeta);
      console.log('  content:', vpMeta?.content || 'N/A');
      console.log('');
      console.log('🎯 Media Query Tests:');
      const mq428 = win.matchMedia('(max-width: 428px)');
      const mq768 = win.matchMedia('(max-width: 768px)');
      const mq1024 = win.matchMedia('(max-width: 1024px)');
      console.log('  (max-width: 428px):', mq428.matches);
      console.log('  (max-width: 768px):', mq768.matches);
      console.log('  (max-width: 1024px):', mq1024.matches);
      console.log('');
      console.log('🖥️ Outer window (for comparison):');
      console.log('  window.innerWidth:', window.innerWidth);
      console.log('  window.innerHeight:', window.innerHeight);
      console.log('  emulationApplied:', emulationApplied);
      console.groupEnd();

      console.log('[LUMI] iframe load ok');
      try { loader.remove(); } catch (_) { }

      // CRITICAL: Only apply responsive emulation on FIRST load
      if (!emulationApplied) {
        emulationApplied = true;
        console.log('[LUMI] Applying responsive emulation (first load only)');
        this.applyResponsiveEmulation(iframe);
      } else {
        console.log('[LUMI] Skipping responsive emulation (already applied)');
        // Just emit ready event for subsequent loads
        try { this.eventBus.emit('viewport:iframe-ready', { iframe }); } catch (_) { }
      }
    }, { passive: true });  // Remove { once: true } to handle reloads

    try {
      iframe.src = this.buildIframeSrc(window.location.href);
    } catch (error) {
      if (this._iframeFallbackTimer) {
        clearTimeout(this._iframeFallbackTimer);
        this._iframeFallbackTimer = null;
      }
      this.handleIframeFallback('exception');
    }
  }

  applyResponsiveEmulation(iframe) {
    if (!iframe || !iframe.contentWindow || !iframe.contentDocument) return;

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    const iframeWidth = iframe.clientWidth;
    const iframeHeight = iframe.clientHeight;

    console.log('[LUMI] Applying responsive emulation:', iframeWidth, 'x', iframeHeight);

    // CRITICAL FIX: We need to set up overrides BEFORE the page loads
    // The current approach (modifying after load) won't work because CSS is already applied
    // Solution: Reload the iframe after setting up the emulation infrastructure

    // Step 1: Inject script that will run BEFORE page scripts
    const setupScript = doc.createElement('script');
    setupScript.textContent = `
      (function() {
        // Override window dimensions before any other scripts run
        const iframeEl = window.frameElement;
        if (iframeEl) {
          Object.defineProperty(window, 'innerWidth', {
            get() { return iframeEl.clientWidth; },
            configurable: true
          });
          Object.defineProperty(window, 'innerHeight', {
            get() { return iframeEl.clientHeight; },
            configurable: true
          });
          Object.defineProperty(window, 'outerWidth', {
            get() { return iframeEl.clientWidth; },
            configurable: true
          });
          Object.defineProperty(window, 'outerHeight', {
            get() { return iframeEl.clientHeight; },
            configurable: true
          });
          console.log('[LUMI] Window dimensions overridden in iframe:', window.innerWidth, 'x', window.innerHeight);
        }
      })();
    `;

    // Insert at the very beginning of head
    const head = doc.head || doc.documentElement;
    if (head.firstChild) {
      head.insertBefore(setupScript, head.firstChild);
    } else {
      head.appendChild(setupScript);
    }

    // Step 2: Inject or update viewport meta tag  
    let vpMeta = doc.querySelector('meta[name="viewport"]');
    if (!vpMeta) {
      vpMeta = doc.createElement('meta');
      vpMeta.name = 'viewport';
      if (head.firstChild) {
        head.insertBefore(vpMeta, head.firstChild);
      } else {
        head.appendChild(vpMeta);
      }
    }
    // Force mobile-friendly viewport
    vpMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

    // Step 3: Inject CSS to ensure responsive behavior
    const responsiveCSS = doc.createElement('style');
    responsiveCSS.id = 'lumi-responsive-fix';
    responsiveCSS.textContent = `
      /* LUMI Responsive Emulation Fix */
      html, body {
        max-width: 100vw !important;
        overflow-x: hidden !important;
      }
      :root {
        --lumi-vw: ${iframeWidth}px;
        --lumi-vh: ${iframeHeight}px;
      }
    `;
    head.appendChild(responsiveCSS);

    // Step 4: CRITICAL - Reload the iframe to apply changes
    // We need to reload because CSS has already been evaluated with wrong window dimensions
    console.log('[LUMI] Reloading iframe to apply responsive emulation...');
    const currentSrc = iframe.src;

    // Set up one-time load listener for the reload
    const reloadHandler = () => {
      console.log('[LUMI] Iframe reloaded with responsive emulation active');

      // Verify dimensions after reload
      const newWin = iframe.contentWindow;
      if (newWin) {
        console.log('[LUMI] Post-reload check:');
        console.log('  window.innerWidth:', newWin.innerWidth);
        console.log('  Media Query (max-width: 768px):', newWin.matchMedia('(max-width: 768px)').matches);
      }

      // Install ResizeObserver for dynamic updates
      if (typeof ResizeObserver !== 'undefined') {
        const resizeObserver = new ResizeObserver(() => {
          const newDoc = iframe.contentDocument;
          if (!newDoc) return;

          const style = newDoc.getElementById('lumi-responsive-fix');
          if (style) {
            const w = iframe.clientWidth;
            const h = iframe.clientHeight;
            style.textContent = style.textContent
              .replace(/--lumi-vw:\s*\d+px/, `--lumi-vw: ${w}px`)
              .replace(/--lumi-vh:\s*\d+px/, `--lumi-vh: ${h}px`);
          }

          // Trigger resize event
          try {
            iframe.contentWindow?.dispatchEvent(new Event('resize'));
          } catch (_) { }
        });
        resizeObserver.observe(iframe);
      }
    };

    iframe.addEventListener('load', reloadHandler, { once: true });

    // Trigger reload
    iframe.src = currentSrc;
  }

  buildIframeSrc(href) {
    try {
      const url = new URL(href);
      // Tag the URL so our content script can detect and avoid bootstrapping inside the stage
      url.searchParams.set('_lumi_vp', '1');
      return url.toString();
    } catch (_) {
      // Fallback: append a marker safely
      if (href.includes('?')) return href + '&_lumi_vp=1';
      if (href.includes('#')) return href.replace('#', '?_lumi_vp=1#');
      return href + '?_lumi_vp=1';
    }
  }

  teardownIframe() {
    if (!this.iframe) return;
    try { this.iframe.remove(); } catch (_) { }
    this.iframe = null;
    if (this._iframeFallbackTimer) {
      clearTimeout(this._iframeFallbackTimer);
      this._iframeFallbackTimer = null;
    }
  }

  handleIframeFallback(reason) {
    if (this.stageMode !== 'iframe') return;
    if (this._iframeFallbackTimer) {
      clearTimeout(this._iframeFallbackTimer);
      this._iframeFallbackTimer = null;
    }
    console.warn(`[LUMI] iframe blocked -> fallback to inline (reason: ${reason})`);
    try { this.eventBus.emit('viewport:iframe-fallback', { reason }); } catch (_) { }
    this.mountInlineStage(reason);
  }

  setPreset(name) {
    const key = PRESETS[name] ? name : 'responsive';
    const logical = PRESETS[key];

    // CRITICAL: Mobile/Pad/Laptop presets MUST use iframe for true responsive emulation
    // Responsive can use inline mode (default desktop behavior)
    const needsIframe = (key === 'mobile' || key === 'pad' || key === 'laptop');

    this.stateManager.batch({
      'ui.viewport.preset': key,
      'ui.viewport.logical': logical,
      'ui.viewport.useIframeStage': needsIframe
    });

    console.log(`[LUMI] Preset "${key}" (${logical.width}x${logical.height}), iframe=${needsIframe}`);
    this.layout();
  }

  setFit(mode) {
    const m = mode || 'width';
    this.stateManager.set('ui.viewport.fit', m);
    const dockWidth = this.stateManager.get('ui.dockWidth') || 420;
    const hasBar = this.stateManager.get('ui.dockOpen') !== false;
    const topOffset = hasBar ? (TOPBAR_HEIGHT + TOPBAR_MARGIN) : 0;
    const availW = Math.max(320, window.innerWidth - dockWidth);
    const availH = Math.max(320, window.innerHeight - topOffset);
    const logical = this.stateManager.get('ui.viewport.logical') || { width: 1280, height: 800 };
    let fitScale = availW / Math.max(1, logical.width);
    if (m === 'screen') fitScale = Math.min(fitScale, availH / Math.max(1, logical.height));
    fitScale = Math.min(1, Math.max(SCALE_MIN, fitScale));
    this.stateManager.batch({ 'ui.viewport.scale': fitScale, 'ui.viewport.auto': true });
    console.log(`[LUMI] fit=${m} auto=true available=${availW}x${availH} logical=${logical.width}x${logical.height} scale=${fitScale.toFixed(3)}`);
    this.layout();
  }

  setScale(value) {
    const v = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(value) || 1));
    this.stateManager.batch({ 'ui.viewport.scale': v, 'ui.viewport.auto': false });
    this.layout();
  }

  setLogical({ width, height }) {
    const w = Math.max(200, Number(width) || 1280);
    const h = Math.max(200, Number(height) || 800);
    this.stateManager.batch({ 'ui.viewport.logical': { width: w, height: h }, 'ui.viewport.auto': true });
    this.layout();
  }

  setZoom(value) {
    if (value === 'auto' || value === 'fit') {
      this.stateManager.set('ui.viewport.auto', true);
      this.recomputeScale();
      this.layout();
      return;
    }
    const v = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(value) || 1));
    this.stateManager.batch({ 'ui.viewport.scale': v, 'ui.viewport.auto': false });
    this.layout();
  }

  recomputeScale() {
    if (!this.enabled) return;
    const auto = !!this.stateManager.get('ui.viewport.auto');
    if (!auto) return;
    try {
      const dockWidth = this.stateManager.get('ui.dockWidth') || 420;
      const hasBar = this.stateManager.get('ui.dockOpen') !== false;
      const topOffset = hasBar ? (TOPBAR_HEIGHT + TOPBAR_MARGIN) : 0;
      const availW = Math.max(320, window.innerWidth - dockWidth);
      const availH = Math.max(320, window.innerHeight - topOffset);
      const logical = this.stateManager.get('ui.viewport.logical') || { width: 1280, height: 800 };
      const fit = this.stateManager.get('ui.viewport.fit') || 'width';
      const scale = this.computeScale(availW, availH, logical, fit);
      const current = this.stateManager.get('ui.viewport.scale') || 1;
      if (Math.abs(scale - current) > 0.0005) {
        this.stateManager.set('ui.viewport.scale', scale);
        console.log(`[LUMI] fit=${fit} auto=true available=${availW}x${availH} logical=${logical.width}x${logical.height} scale=${scale.toFixed(3)}`);
      }
    } catch (error) {
      console.warn('[LUMI] recomputeScale failed', error);
    }
  }

  computeScale(availW, availH, logical, fit) {
    const W = Math.max(1, Number(logical?.width) || 1280);
    const H = Math.max(1, Number(logical?.height) || 800);
    if (fit === 'screen') return Math.min(availW / W, availH / H);
    return availW / W;
  }

  layout() {
    this.recomputeScale();
    if (!this.canvas || !this.stageFrame || !this.contentWrapper) return;
    const dockWidth = this.stateManager.get('ui.dockWidth') || 420;
    const align = this.stateManager.get('ui.viewport.mode') || 'center';
    const hasBar = this.stateManager.get('ui.dockOpen') !== false;
    const scale = this.stateManager.get('ui.viewport.scale') || 1;
    const logical = this.stateManager.get('ui.viewport.logical') || { width: 1280, height: 800 };

    const topOffset = hasBar ? (TOPBAR_HEIGHT + TOPBAR_MARGIN) : 0;
    this.root.style.cssText = `position: fixed; left: 0; right: ${dockWidth}px; top: ${topOffset}px; bottom: 0; z-index: 2147483643;`;
    this.canvas.style.cssText = 'position:absolute; inset:0; overflow:auto; pointer-events:auto;';

    this.stageFrame.style.position = 'absolute';
    this.stageFrame.style.width = logical.width + 'px';
    this.stageFrame.style.height = logical.height + 'px';
    this.stageFrame.style.transformOrigin = 'top left';
    this.stageFrame.style.transform = `scale(${scale})`;
    this.stageFrame.style.transition = 'transform 0.12s ease, left 0.12s ease';

    const canvasRect = this.canvas.getBoundingClientRect();
    const canvasWidth = Math.max(0, canvasRect.width);
    const scaledW = Math.round(logical.width * scale);
    const leftOffset = align === 'center' && scaledW <= canvasWidth ? Math.max(0, Math.floor((canvasWidth - scaledW) / 2)) : 0;
    this.stageFrame.style.left = leftOffset + 'px';
    this.stageFrame.style.top = '0px';

    const scaledH = Math.round(Math.max(1, logical.height) * scale);
    this.ensureSpacer(scaledW, scaledH);
  }

  ensureSpacer(width, height) {
    if (!this.canvas) return;
    let spacer = this.canvas.querySelector('#lumi-viewport-spacer');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = 'lumi-viewport-spacer';
      spacer.style.position = 'absolute';
      spacer.style.zIndex = '-1';
      this.canvas.appendChild(spacer);
    }
    spacer.style.width = width + 'px';
    spacer.style.height = height + 'px';
  }

  isSpacePressed() {
    try { return window.__lumiSpacePressed === true; } catch (error) { return false; }
  }
}

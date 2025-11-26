/**
 * HighlightManager - Manage hover/selection halos and screenshot overlays
 */

export default class HighlightManager {
  constructor(eventBus = null, rootDocument = document, rootWindow = window) {
    this.eventBus = eventBus;
    this.doc = rootDocument || document;
    this.win = rootWindow || window;
    this.hoverHighlight = null;
    this.selectionHighlights = [];
    this.selectionElements = [];
    this.selectionListeners = new Map();
    this.screenshotOverlay = null;
    this._mo = null;
    this._onScroll = this.updateAllPositions.bind(this);
    this._onResize = this.updateAllPositions.bind(this);
    this._raf = null;
    this._extraScrollEl = null;
  }

  showHover(element) {
    this.hideHover();
    const bbox = element.getBoundingClientRect();
    const halo = this.doc.createElement('div');
    halo.className = 'lumi-highlight lumi-hover';
    halo.style.cssText = this.buildHaloStyle(bbox, element);
    // Hover halo must never intercept pointer events; clicks should go to the page element
    halo.style.pointerEvents = 'none';
    this.doc.body.appendChild(halo);
    this.hoverHighlight = halo;
  }

  hideHover() {
    if (this.hoverHighlight) {
      this.hoverHighlight.remove();
      this.hoverHighlight = null;
    }
  }

  addSelection(element, index = null) {
    const bbox = element.getBoundingClientRect();
    const halo = this.doc.createElement('div');
    halo.className = 'lumi-highlight lumi-selected';
    halo.style.cssText = this.buildHaloStyle(bbox, element);

    // Subtle fill layer (only on hover)
    const fill = this.doc.createElement('div');
    fill.style.cssText = `
      position:absolute; inset:0; border-radius:inherit;
      background: color-mix(in srgb, var(--accent) 6%, transparent);
      pointer-events:none; opacity:0; transition: opacity 120ms ease;
    `;
    halo.appendChild(fill);

    // Inline edit affordance (top-right pill)
    const action = this.doc.createElement('button');
    action.type = 'button';
    action.setAttribute('aria-label', 'Edit');
    action.style.cssText = `
      position:absolute; top:-10px; right:-10px; 
      padding:4px 8px; border-radius:999px; border:1px solid var(--dock-stroke);
      background: var(--dock-bg); color: var(--dock-fg);
      font-size:11px; line-height:1; pointer-events:auto; cursor:pointer;
      box-shadow: var(--shadow); display:none;
    `;
    action.textContent = 'Edit';
    action.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = resolveIndex();
      if (this.eventBus && typeof idx === 'number') {
        this.eventBus.emit('edit:open', { index: idx, element });
      }
    });
    halo.appendChild(action);

    const resolveIndex = () => {
      const current = this.selectionElements.indexOf(element);
      if (current >= 0) return current;
      return typeof index === 'number' ? index : 0;
    };

    // Element label (top-left, subtle)
    const label = this.doc.createElement('div');
    label.style.cssText = `
      position:absolute; top:-10px; left:0; transform: translateY(-100%);
      padding:0 6px; font-size:10px; line-height:16px; height:16px; border-radius:8px;
      color: var(--dock-fg-2); background: color-mix(in srgb, var(--dock-bg) 80%, transparent);
      pointer-events:none; white-space:nowrap; box-shadow:none; border:none;
    `;
    label.textContent = this.readable(element);
    halo.appendChild(label);

    halo.addEventListener('mouseenter', () => {
      action.style.display = 'inline-flex';
      fill.style.opacity = '1';
      if (this.eventBus) {
        this.eventBus.emit('interaction:hover', { element, index: resolveIndex() });
      }
    });
    halo.addEventListener('mouseleave', () => {
      action.style.display = 'none';
      fill.style.opacity = '0';
      if (this.eventBus) {
        this.eventBus.emit('interaction:leave', { element, index: resolveIndex() });
      }
    });

    halo.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = resolveIndex();
      if (this.eventBus && typeof idx === 'number') {
        this.eventBus.emit('edit:open', { index: idx, element });
      }
    });

    // Inline Text Editing
    halo.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Only allow if it's a text-like element
      if (element.children.length > 0 && !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'LI', 'BUTTON'].includes(element.tagName)) return;

      element.contentEditable = 'true';
      element.focus();

      // Disable pointer events on children to prevent link clicks
      const children = element.querySelectorAll('*');
      children.forEach(c => c.style.pointerEvents = 'none');

      // Temporarily hide halo while editing
      halo.style.display = 'none';

      const originalText = element.textContent;

      const finishEdit = () => {
        element.removeAttribute('contenteditable');
        // Restore pointer events
        children.forEach(c => c.style.pointerEvents = '');

        halo.style.display = 'block';

        const newText = element.textContent;
        if (newText !== originalText && this.eventBus) {
          const idx = resolveIndex();
          this.eventBus.emit('wysiwyg:apply', {
            index: idx,
            selector: this.readable(element),
            changes: { text: newText },
            summary: `Edit text content`
          });
        }

        element.removeEventListener('blur', finishEdit);
        element.removeEventListener('keydown', onKey);
        element.removeEventListener('input', onInput);
      };

      const onKey = (ke) => {
        if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          element.blur(); // Triggers finishEdit
        }
        if (ke.key === 'Escape') {
          element.textContent = originalText;
          element.blur();
        }
      };

      const onInput = () => {
        if (this.eventBus) {
          this.eventBus.emit('wysiwyg:sync', { text: element.textContent });
        }
      };

      element.addEventListener('blur', finishEdit);
      element.addEventListener('keydown', onKey);
      element.addEventListener('input', onInput);
    });

    this.doc.body.appendChild(halo);
    const nextIndex = this.selectionHighlights.push(halo) - 1;
    this.selectionElements.push(element);

    const onEnter = () => {
      if (this.eventBus) {
        this.eventBus.emit('interaction:hover', { element, index: resolveIndex() });
      }
    };
    const onLeave = () => {
      if (this.eventBus) {
        this.eventBus.emit('interaction:leave', { element, index: resolveIndex() });
      }
    };
    element.addEventListener('mouseenter', onEnter);
    element.addEventListener('mouseleave', onLeave);
    this.selectionListeners.set(element, { onEnter, onLeave });

    halo.dataset.index = String(nextIndex);

    this.ensureObservers();
    return nextIndex;
  }

  removeSelection(index) {
    const highlight = this.selectionHighlights[index];
    if (highlight) {
      highlight.remove();
    }
    this.selectionHighlights.splice(index, 1);

    const element = this.selectionElements[index];
    if (element) {
      const handlers = this.selectionListeners.get(element);
      if (handlers) {
        element.removeEventListener('mouseenter', handlers.onEnter);
        element.removeEventListener('mouseleave', handlers.onLeave);
        this.selectionListeners.delete(element);
      }
    }
    this.selectionElements.splice(index, 1);

    this.selectionHighlights.forEach((halo, idx) => {
      halo.dataset.index = String(idx);
    });
  }

  clearAllSelections() {
    this.selectionHighlights.forEach(h => h.remove());
    this.selectionHighlights = [];
    this.selectionElements.forEach((element) => {
      const handlers = this.selectionListeners.get(element);
      if (handlers) {
        element.removeEventListener('mouseenter', handlers.onEnter);
        element.removeEventListener('mouseleave', handlers.onLeave);
      }
    });
    this.selectionElements = [];
    this.selectionListeners.clear();
    this.teardownObservers();
  }

  showScreenshotOverlay(bbox) {
    this.hideScreenshotOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'lumi-screenshot-overlay';
    overlay.style.cssText = `
      position: absolute;
      left: ${bbox.left}px;
      top: ${bbox.top}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      border: 2px dashed var(--accent);
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      pointer-events: none;
      z-index: 2147483645;
    `;
    document.body.appendChild(overlay);
    this.screenshotOverlay = overlay;
  }

  updateScreenshotOverlay(bbox) {
    if (!this.screenshotOverlay) {
      this.showScreenshotOverlay(bbox);
      return;
    }
    this.screenshotOverlay.style.left = `${bbox.left}px`;
    this.screenshotOverlay.style.top = `${bbox.top}px`;
    this.screenshotOverlay.style.width = `${bbox.width}px`;
    this.screenshotOverlay.style.height = `${bbox.height}px`;
  }

  hideScreenshotOverlay() {
    if (this.screenshotOverlay) {
      this.screenshotOverlay.remove();
      this.screenshotOverlay = null;
    }
  }

  clearAll() {
    this.hideHover();
    this.clearAllSelections();
    this.hideScreenshotOverlay();
  }

  buildHaloStyle(bbox, element) {
    const computed = window.getComputedStyle(element);
    const radius = computed.borderRadius || '14px';
    return `
      position: absolute;
      top: ${bbox.top + window.scrollY}px;
      left: ${bbox.left + window.scrollX}px;
      width: ${bbox.width}px;
      height: ${bbox.height}px;
      pointer-events: auto;
      z-index: 2147483645;
      border-radius: ${radius};
      box-shadow: 0 0 0 2px var(--accent);
      background: transparent;
      cursor: pointer;
      transition: box-shadow 0.15s ease;
    `;
  }

  penSVG() { return ''; }

  readable(el) {
    try {
      if (!el) return 'element';
      if (el.id) return `#${el.id}`;
      const cls = el.classList && el.classList[0];
      const tag = (el.tagName || 'element').toLowerCase();
      return cls ? `${tag}.${cls}` : tag;
    } catch (_) { return 'element'; }
  }

  ensureObservers() {
    if (this._mo) return;
    this._mo = new MutationObserver(() => this.scheduleUpdate());
    try { this._mo.observe(this.doc.body, { attributes: true, childList: true, subtree: true }); } catch (_) { }
    this.win.addEventListener('scroll', this._onScroll, true);
    this.win.addEventListener('resize', this._onResize, true);
    if (this._extraScrollEl) {
      try { this._extraScrollEl.addEventListener('scroll', this._onScroll, { passive: true }); } catch (_) { }
    }
  }

  teardownObservers() {
    if (this._mo) { try { this._mo.disconnect(); } catch (_) { } this._mo = null; }
    this.win.removeEventListener('scroll', this._onScroll, true);
    this.win.removeEventListener('resize', this._onResize, true);
    if (this._extraScrollEl) {
      try { this._extraScrollEl.removeEventListener('scroll', this._onScroll); } catch (_) { }
    }
    if (this._raf) { this.win.cancelAnimationFrame ? this.win.cancelAnimationFrame(this._raf) : cancelAnimationFrame(this._raf); this._raf = null; }
  }

  setExtraScrollContainer(el) {
    if (this._extraScrollEl && this._extraScrollEl !== el) {
      try { this._extraScrollEl.removeEventListener('scroll', this._onScroll); } catch (_) { }
    }
    this._extraScrollEl = el || null;
    // If observers are active, attach immediately
    if (this._extraScrollEl && this._mo) {
      try { this._extraScrollEl.addEventListener('scroll', this._onScroll, { passive: true }); } catch (_) { }
    }
  }

  scheduleUpdate() {
    if (this._raf) return;
    const raf = this.win.requestAnimationFrame || requestAnimationFrame;
    this._raf = raf(() => {
      this._raf = null;
      this.updateAllPositions();
    });
  }

  updateAllPositions() {
    if (!this.selectionHighlights.length) return;
    this.selectionHighlights.forEach((halo, idx) => {
      const el = this.selectionElements[idx];
      if (!halo || !el || !el.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      halo.style.top = (r.top + this.win.scrollY) + 'px';
      halo.style.left = (r.left + this.win.scrollX) + 'px';
      halo.style.width = r.width + 'px';
      halo.style.height = r.height + 'px';
      // keep radius in sync if element style changed
      try { halo.style.borderRadius = this.win.getComputedStyle(el).borderRadius || '14px'; } catch (_) { }
    });
  }
}

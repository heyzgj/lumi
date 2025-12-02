/**
 * PositionController - top/left nudges via keyboard (adapted from VisBug position.js).
 */

export default class PositionController {
  constructor(eventBus, stateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.active = false;
    this.inlineEditing = false;
    this._onKeyDown = this.handleKeyDown.bind(this);
    this._teardowns = [];
    this._dragging = null;
    this._selectionUnsub = null;
    this._onEscape = (e) => {
      if (e.key === 'Escape' && this.active) {
        e.preventDefault();
        e.stopPropagation();
        this.disable();
        try { this.eventBus.emit('mode:position', false); } catch (_) {}
      }
    };
    this._highlightsPatched = false;
    if (this.eventBus && typeof this.eventBus.on === 'function') {
      try {
        this.eventBus.on('inline-edit:active', (active) => {
          this.inlineEditing = !!active;
        });
      } catch (_) {}
    }
  }

  enable() {
    if (this.active) return;
    this.active = true;
    const doc = this.getDoc();
    try { doc.addEventListener('keydown', this._onKeyDown, true); } catch (_) {}
    try { doc.addEventListener('keydown', this._onEscape, true); } catch (_) {}
    this.attachDrag();
    this.blockTextSelection(true);
    this.attachBlockers();
    this.toggleHighlightPassThrough(true);
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    const doc = this.getDoc();
    try { doc.removeEventListener('keydown', this._onKeyDown, true); } catch (_) {}
    try { doc.removeEventListener('keydown', this._onEscape, true); } catch (_) {}
    this.detachDrag();
    this.blockTextSelection(false);
    this.detachBlockers();
    this.toggleHighlightPassThrough(false);
  }

  attachSelectionWatcher() {
    if (this._selectionUnsub) return;
    this._selectionUnsub = this.stateManager.subscribe('selection.elements', () => {
      if (this.active) this.attachDrag();
      if (this.active) this.toggleHighlightPassThrough(true);
    });
  }

  destroy() {
    this.disable();
    if (this._selectionUnsub) {
      try { this._selectionUnsub(); } catch (_) {}
      this._selectionUnsub = null;
    }
  }

  handleKeyDown(e) {
    if (!this.active) return;
    if (this.inlineEditing) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const selection = this.stateManager.get('selection.elements') || [];
    if (selection.length !== 1) return;
    const el = selection[0]?.element;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const isShift = e.shiftKey;
    const delta = isShift ? 10 : 1;
    if (!(el instanceof SVGElement)) this.ensurePositionable(el);
    switch (e.key) {
      case 'ArrowLeft':
        this.nudge(el, 'left', -delta);
        break;
      case 'ArrowRight':
        this.nudge(el, 'left', delta);
        break;
      case 'ArrowUp':
        this.nudge(el, 'top', -delta);
        break;
      case 'ArrowDown':
        this.nudge(el, 'top', delta);
        break;
      default:
        break;
    }
  }

  ensurePositionable(el) {
    try {
      const pos = window.getComputedStyle(el).position;
      if (pos === 'static') el.style.position = 'relative';
    } catch (_) {}
  }

  nudge(el, prop, delta) {
    if (el instanceof SVGElement) {
      const { x, y } = this.parseTranslate(el);
      const nextX = prop === 'left' ? x + delta : x;
      const nextY = prop === 'top' ? y + delta : y;
      try { el.setAttribute('transform', `translate(${nextX},${nextY})`); } catch (_) {}
    } else {
      const current = this.parsePx(el.style[prop]) || 0;
      const next = current + delta;
      try { el.style.setProperty(prop, `${next}px`, 'important'); } catch (_) {}
    }
    this.emitPosition(el);
  }

  parsePx(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  parseTranslate(el) {
    const transform = el.getAttribute && el.getAttribute('transform');
    if (!transform || !transform.includes('translate')) return { x: 0, y: 0 };
    try {
      const inside = transform.substring(transform.indexOf('(') + 1, transform.indexOf(')'));
      const [rawX, rawY] = inside.split(',').map(v => parseFloat(v.trim()));
      return {
        x: Number.isFinite(rawX) ? rawX : 0,
        y: Number.isFinite(rawY) ? rawY : 0
      };
    } catch (_) {
      return { x: 0, y: 0 };
    }
  }

  emitPosition(el) {
    const selection = this.stateManager.get('selection.elements') || [];
    const idx = selection.findIndex(item => item?.element === el);
    if (idx < 0) return;
    const selector = selection[idx]?.selector;
    const changes = {
      top: el instanceof SVGElement ? '' : el.style.top || '',
      left: el instanceof SVGElement ? '' : el.style.left || '',
      position: el instanceof SVGElement ? '' : el.style.position || '',
      transform: el instanceof SVGElement ? (el.getAttribute('transform') || '') : ''
    };
    try {
      this.eventBus.emit('wysiwyg:apply', {
        index: idx,
        selector,
        changes,
        summary: 'Nudge position'
      });
    } catch (_) {}
  }

  attachDrag() {
    this.detachDrag();
    const selection = this.stateManager.get('selection.elements') || [];
    if (selection.length !== 1) return;
    const el = selection[0]?.element;
    if (!el) return;
    const doc = el.ownerDocument || document;
    const state = { down: false, startX: 0, startY: 0, baseTop: 0, baseLeft: 0, baseX: 0, baseY: 0, deltaX: 0, deltaY: 0 };
    const onDown = (e) => {
      if (e.button !== 0) return;
      if (!(el instanceof SVGElement)) this.ensurePositionable(el);
      state.down = true;
      state.startX = e.clientX;
      state.startY = e.clientY;
      if (el instanceof SVGElement) {
        const { x, y } = this.parseTranslate(el);
        state.baseX = x;
        state.baseY = y;
      } else {
        state.baseTop = this.parsePx(el.style.top) || 0;
        state.baseLeft = this.parsePx(el.style.left) || 0;
      }
      try { el.style.willChange = el instanceof SVGElement ? 'transform' : 'transform, top, left'; } catch (_) {}
      try { doc.addEventListener('mousemove', onMove, true); } catch (_) {}
      try { doc.addEventListener('mouseup', onUp, true); } catch (_) {}
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!state.down) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      state.deltaX = dx;
      state.deltaY = dy;
      if (el instanceof SVGElement) {
        const nextX = state.baseX + dx;
        const nextY = state.baseY + dy;
        try { el.setAttribute('transform', `translate(${nextX},${nextY})`); } catch (_) {}
      } else {
        // Preview via transform; commit on drop
        try { el.style.transform = `translate(${dx}px, ${dy}px)`; } catch (_) {}
      }
    };
    const onUp = () => {
      if (!state.down) return;
      const dx = state.deltaX || 0;
      const dy = state.deltaY || 0;
      if (el instanceof SVGElement) {
        const nextX = state.baseX + dx;
        const nextY = state.baseY + dy;
        try { el.setAttribute('transform', `translate(${nextX},${nextY})`); } catch (_) {}
      } else {
        const nextLeft = state.baseLeft + dx;
        const nextTop = state.baseTop + dy;
        try { el.style.setProperty('left', `${nextLeft}px`, 'important'); } catch (_) {}
        try { el.style.setProperty('top', `${nextTop}px`, 'important'); } catch (_) {}
        try { el.style.transform = ''; } catch (_) {}
      }
      this.emitPosition(el);
      state.down = false;
      try { doc.removeEventListener('mousemove', onMove, true); } catch (_) {}
      try { doc.removeEventListener('mouseup', onUp, true); } catch (_) {}
      try { el.style.willChange = ''; } catch (_) {}
    };
    try { el.style.cursor = 'move'; } catch (_) {}
    try { el.addEventListener('mousedown', onDown, true); } catch (_) {}
    this._teardowns.push(() => {
      try { el.removeEventListener('mousedown', onDown, true); } catch (_) {}
      try { doc.removeEventListener('mousemove', onMove, true); } catch (_) {}
      try { doc.removeEventListener('mouseup', onUp, true); } catch (_) {}
      try { el.style.cursor = ''; } catch (_) {}
    });
  }

  detachDrag() {
    this._teardowns.forEach((fn) => { try { fn(); } catch (_) {} });
    this._teardowns = [];
  }

  blockTextSelection(enable) {
    const doc = this.getDoc();
    try {
      doc.body.style.userSelect = enable ? 'none' : '';
      doc.documentElement.style.userSelect = enable ? 'none' : '';
    } catch (_) {}
  }

  attachBlockers() {
    const doc = this.getDoc();
    this._blocker = (e) => {
      if (!this.active) return;
      const selection = this.stateManager.get('selection.elements') || [];
      const el = selection[0]?.element;
      if (!el) return;
      if (!el.contains(e.target) && e.target !== el) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    try { doc.addEventListener('mousedown', this._blocker, true); } catch (_) {}
    try { doc.addEventListener('dragstart', this._blocker, true); } catch (_) {}
  }

  detachBlockers() {
    const doc = this.getDoc();
    if (!this._blocker) return;
    try { doc.removeEventListener('mousedown', this._blocker, true); } catch (_) {}
    try { doc.removeEventListener('dragstart', this._blocker, true); } catch (_) {}
    this._blocker = null;
  }

  getDoc() {
    const selection = this.stateManager.get('selection.elements') || [];
    const el = selection[0]?.element;
    return el?.ownerDocument || document;
  }

  toggleHighlightPassThrough(enable) {
    if (this._highlightsPatched === enable) return;
    this._highlightsPatched = enable;
    try {
      const doc = this.getDoc();
      const highlights = doc.querySelectorAll('.lumi-highlight');
      highlights.forEach((h) => {
        h.dataset.prevPointer = h.style.pointerEvents || '';
        h.style.pointerEvents = enable ? 'none' : (h.dataset.prevPointer || '');
      });
    } catch (_) {}
  }
}

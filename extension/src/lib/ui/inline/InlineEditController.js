/**
 * InlineEditController
 * Enables double-click inline text editing, lifted from VisBug's contenteditable pattern.
 */

export default class InlineEditController {
  constructor(eventBus, stateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this._active = false;
    this._current = null;
    this._teardowns = new Map();
    this._selectionUnsub = null;
    this._blocker = null;
  }

  init() {
    if (this._selectionUnsub) return;
    this._selectionUnsub = this.stateManager.subscribe('selection.elements', () => {
      this.attachListeners();
    });
    this.attachListeners();
  }

  destroy() {
    this.detachListeners();
    if (this._selectionUnsub) {
      try { this._selectionUnsub(); } catch (_) {}
      this._selectionUnsub = null;
    }
  }

  attachListeners() {
    this.detachListeners();
    const selection = this.stateManager.get('selection.elements') || [];
    selection.forEach((item, index) => {
      const el = item?.element;
      if (!el) return;
      const doc = el.ownerDocument || document;
      const handler = (e) => this.handleDoubleClick(e, el, index);
      try {
        doc.addEventListener('dblclick', handler, true);
        this._teardowns.set(el, () => doc.removeEventListener('dblclick', handler, true));
      } catch (_) {}
    });
  }

  detachListeners() {
    this._teardowns.forEach((fn) => {
      try { fn(); } catch (_) {}
    });
    this._teardowns.clear();
  }

  handleDoubleClick(event, element, index) {
    if (!element || this._active) return;
    if (event && event.target && event.target !== element && !element.contains(event.target)) return;
    if (!this.canEditText(element)) return;
    if (!this.isSelectedElement(element)) return;
    event.preventDefault();
    event.stopPropagation();
    this.startEditing(element, index);
  }

  startEditing(element, index) {
    this._active = true;
    const doc = element.ownerDocument || document;
    const originalText = element.textContent;
    if (this.eventBus) {
      try { this.eventBus.emit('inline-edit:active', true); } catch (_) {}
    }
    const stopBubbling = (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    };
    const handleBlur = () => this.finishEditing(element, index, originalText, cleanup);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        element.textContent = originalText;
        cleanup();
        this._active = false;
      }
    };

    const cleanup = () => {
      try { element.removeAttribute('contenteditable'); } catch (_) {}
      try { element.removeAttribute('spellcheck'); } catch (_) {}
      try { element.removeEventListener('blur', handleBlur); } catch (_) {}
      try { element.removeEventListener('keydown', stopBubbling); } catch (_) {}
      try { element.removeEventListener('keydown', handleKeyDown); } catch (_) {}
      try { doc.removeEventListener('keydown', handleKeyDown, true); } catch (_) {}
      this._active = false;
      if (this.eventBus) {
        try { this.eventBus.emit('inline-edit:active', false); } catch (_) {}
      }
      if (this._blocker) {
        try { doc.removeEventListener('mousedown', this._blocker, true); } catch (_) {}
        try { doc.removeEventListener('click', this._blocker, true); } catch (_) {}
        this._blocker = null;
      }
    };

    this._blocker = (e) => {
      if (!this._active) return;
      if (e.target === element || element.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      try { element.focus({ preventScroll: true }); } catch (_) {}
    };

    try {
      element.setAttribute('contenteditable', 'true');
      element.setAttribute('spellcheck', 'true');
      element.focus({ preventScroll: true });
      element.addEventListener('blur', handleBlur);
      element.addEventListener('keydown', stopBubbling);
      element.addEventListener('keydown', handleKeyDown);
      doc.addEventListener('keydown', handleKeyDown, true);
      doc.addEventListener('mousedown', this._blocker, true);
      doc.addEventListener('click', this._blocker, true);
    } catch (_) {
      cleanup();
      this._active = false;
    }
  }

  finishEditing(element, index, originalText, cleanup) {
    const nextText = (element.textContent || '').trim();
    cleanup();
    if (nextText === (originalText || '').trim()) return;
    const selection = this.stateManager.get('selection.elements') || [];
    const entry = selection[index];
    const selector = entry?.selector;
    try {
      this.eventBus.emit('wysiwyg:apply', {
        index,
        selector,
        changes: { text: element.textContent },
        summary: 'Inline edit text'
      });
      this.eventBus.emit('inline-edit:applied', { index, selector, text: element.textContent });
    } catch (_) {}
  }

  canEditText(element) {
    try {
      const tag = (element.tagName || '').toLowerCase();
      if (['input', 'textarea', 'img', 'video', 'canvas', 'svg', 'hr', 'br'].includes(tag)) return false;
      return element.childElementCount === 0;
    } catch (_) {
      return false;
    }
  }

  isSelectedElement(element) {
    const selection = this.stateManager.get('selection.elements') || [];
    return selection.some(item => item?.element === element);
  }
}

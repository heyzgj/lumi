/**
 * MoveController - DOM reorder via keyboard (adapted from VisBug move.js).
 */

import { getNodeIndex } from '../../utils/dom.js';

export default class MoveController {
  constructor(eventBus, stateManager) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.active = false;
    this.inlineEditing = false;
    this._onKeyDown = this.handleKeyDown.bind(this);
    this._teardowns = [];
    this._dragSrc = null;
    this._selectionUnsub = null;
    this._onEscape = (e) => {
      if (e.key === 'Escape' && this.active) {
        e.preventDefault();
        e.stopPropagation();
        this.disable();
        try { this.eventBus.emit('mode:move', false); } catch (_) {}
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
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const selection = this.stateManager.get('selection.elements') || [];
    if (selection.length !== 1) return;
    const el = selection[0]?.element;
    if (!el || !el.parentNode) return;
    if (!this.hasSibling(el)) return;
    e.preventDefault();
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowUp':
        this.moveBefore(el);
        break;
      case 'ArrowDown':
        this.moveAfter(el);
        break;
      default:
        break;
    }
    this.emitMove(el);
  }

  hasSibling(el) {
    return !!(el.previousElementSibling || el.nextElementSibling);
  }

  moveBefore(el) {
    if (el.previousElementSibling) {
      try { el.parentNode.insertBefore(el, el.previousElementSibling); } catch (_) {}
    }
  }

  moveAfter(el) {
    if (el.nextElementSibling) {
      try { el.parentNode.insertBefore(el, el.nextElementSibling.nextSibling); } catch (_) {}
    } else {
      try { el.parentNode.appendChild(el); } catch (_) {}
    }
  }

  popOut(el) {
    const parent = el.parentNode;
    const grand = parent?.parentNode;
    if (!parent || !grand) return;
    // Limit v3: only reorder within same parent; pop-out disabled
  }

  moveIntoNext(el) {
    if (el.nextElementSibling) {
      try { el.parentNode.insertBefore(el, el.nextElementSibling.nextSibling); } catch (_) {}
    }
  }

  emitMove(el) {
    const selection = this.stateManager.get('selection.elements') || [];
    const idx = selection.findIndex(item => item?.element === el);
    if (idx < 0) return;
    const selector = selection[idx]?.selector;
    const parent = el.parentNode;
    const newIndex = getNodeIndex(el);
    try {
      this.eventBus.emit('wysiwyg:apply', {
        index: idx,
        selector,
        changes: {},
        summary: 'Reorder element',
        domMove: {
          parentSelector: parent?.getAttribute ? parent.getAttribute('data-lumi-id') || null : null,
          position: newIndex
        }
      });
    } catch (_) {}
  }

  attachDrag() {
    this.detachDrag();
    const selection = this.stateManager.get('selection.elements') || [];
    if (selection.length !== 1) return;
    const el = selection[0]?.element;
    if (!el || !this.hasSibling(el)) return;
    const doc = el.ownerDocument || document;
    const siblings = Array.from(el.parentNode?.children || []);
    let dropCueTarget = null;

    const onDragStart = (e) => {
      this._dragSrc = el;
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); } catch (_) {}
      el.classList.add('lumi-drag-src');
    };
    const onDragOver = (e) => {
      if (!this._dragSrc) return;
      const target = e.target.closest && e.target.closest('*');
      if (!target) return;
      if (target === this._dragSrc) return;
      if (target.parentNode !== el.parentNode) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
      if (dropCueTarget && dropCueTarget !== target) this.applyDropCue(dropCueTarget, false);
      this.applyDropCue(target, true);
      dropCueTarget = target;
    };
    const onDrop = (e) => {
      if (!this._dragSrc) return;
      e.preventDefault();
      const target = e.target.closest && e.target.closest('*');
      if (target) this.applyDropCue(target, false);
      if (dropCueTarget && dropCueTarget !== target) this.applyDropCue(dropCueTarget, false);
      dropCueTarget = null;
      if (target && target.parentNode === el.parentNode && target !== this._dragSrc) {
        try { target.parentNode.insertBefore(this._dragSrc, target.nextSibling); } catch (_) {}
        this.emitMove(this._dragSrc);
      } else if (target === el.parentNode) {
        try { target.appendChild(this._dragSrc); this.emitMove(this._dragSrc); } catch (_) {}
      }
      cleanup();
    };
    const onDragEnd = () => cleanup();
    const cleanup = () => {
      this._dragSrc = null;
      el.classList.remove('lumi-drag-src');
      if (dropCueTarget) this.applyDropCue(dropCueTarget, false);
      dropCueTarget = null;
    };

    try { el.setAttribute('draggable', 'true'); } catch (_) {}
    try { el.style.cursor = 'move'; } catch (_) {}
    try { el.addEventListener('dragstart', onDragStart); } catch (_) {}
    try { doc.addEventListener('dragover', onDragOver, true); } catch (_) {}
    try { doc.addEventListener('drop', onDrop, true); } catch (_) {}
    try { el.addEventListener('dragend', onDragEnd); } catch (_) {}

    this._teardowns.push(() => {
      try { el.removeAttribute('draggable'); } catch (_) {}
      try { el.removeEventListener('dragstart', onDragStart); } catch (_) {}
      try { doc.removeEventListener('dragover', onDragOver, true); } catch (_) {}
      try { doc.removeEventListener('drop', onDrop, true); } catch (_) {}
      try { el.removeEventListener('dragend', onDragEnd); } catch (_) {}
      try { el.style.cursor = ''; } catch (_) {}
    });
  }

  detachDrag() {
    this._teardowns.forEach((fn) => { try { fn(); } catch (_) {} });
    this._teardowns = [];
    this._dragSrc = null;
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

  applyDropCue(target, active) {
    try {
      if (!target) return;
      if (active) {
        target.dataset.prevOutline = target.style.outline || '';
        target.style.outline = '2px solid color-mix(in srgb, var(--lumi-accent, #3B82F6) 60%, transparent)';
      } else {
        target.style.outline = target.dataset.prevOutline || '';
        delete target.dataset.prevOutline;
      }
    } catch (_) {}
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

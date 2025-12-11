/**
 * ElementSelector - Handle element selection mode
 */

import { shouldIgnoreElement, getElementSelector } from '../utils/dom.js';

export default class ElementSelector {
  constructor(eventBus, stateManager, highlightManager, topBanner, rootDocument = document, rootWindow = window) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.highlightManager = highlightManager;
    this.topBanner = topBanner;
    this.doc = rootDocument || document;
    this.win = rootWindow || window;
    this.isActive = false;
    this._blockers = [];

    // Bind methods
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  // Local helper: whether text content can be edited safely (leaf nodes only)
  canEditText(el) {
    try {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (['input', 'textarea', 'img', 'video', 'canvas', 'svg'].includes(tag)) return false;
      return el.childElementCount === 0;
    } catch (_) { return false; }
  }

  activate() {
    if (this.isActive) return;

    this.isActive = true;
    this.stateManager.set('ui.mode', 'element');

    this.topBanner.update('Click to select element');

    this.doc.addEventListener('mousemove', this.handleMouseMove, true);
    this.doc.addEventListener('click', this.handleClick, true);
    this.doc.addEventListener('keydown', this.handleKeyDown, true);
    // Block page interactions while picking
    const block = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'].forEach(evt => {
      this.doc.addEventListener(evt, block, true);
      this._blockers.push({ evt, block });
    });
    this.doc.documentElement.classList.add('lumi-element-cursor');
    this.doc.body.classList.add('lumi-element-cursor');

    this.eventBus.emit('element-mode:activated');
  }

  deactivate() {
    if (!this.isActive) return;

    this.isActive = false;
    this.stateManager.set('ui.mode', 'idle');
    this.stateManager.set('ui.dockState', 'normal');

    this.topBanner.hide();
    this.highlightManager.hideHover();

    this.doc.removeEventListener('mousemove', this.handleMouseMove, true);
    this.doc.removeEventListener('click', this.handleClick, true);
    this.doc.removeEventListener('keydown', this.handleKeyDown, true);
    // Remove blockers
    this._blockers.forEach(({ evt, block }) => {
      this.doc.removeEventListener(evt, block, true);
    });
    this._blockers = [];
    this.doc.documentElement.classList.remove('lumi-element-cursor');
    this.doc.body.classList.remove('lumi-element-cursor');

    this.eventBus.emit('element-mode:deactivated');
  }

  handleMouseMove(e) {
    if (!this.isActive || shouldIgnoreElement(e.target)) return;

    const hoveredElement = this.stateManager.get('selection.hoveredElement');
    if (hoveredElement !== e.target) {
      this.stateManager.set('selection.hoveredElement', e.target);
      this.highlightManager.showHover(e.target);
    }
  }

  handleKeyDown(e) {
    if (!this.isActive) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.deactivate();
    }
  }

  handleClick(e) {
    if (!this.isActive || shouldIgnoreElement(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    // UX: element mode is additive by default
    const element = e.target;
    this.addElement(element);
  }

  addElement(element) {
    const elements = this.stateManager.get('selection.elements');

    // Check if already selected
    const exists = elements.some(item => item.element === element);
    if (exists) return;

    const selector = getElementSelector(element);
    const bbox = element.getBoundingClientRect();

    // Capture a baseline snapshot for Reset semantics across multiple edits
    const baselineInline = {
      color: element.style.color,
      backgroundColor: element.style.backgroundColor,
      fontSize: element.style.fontSize,
      fontWeight: element.style.fontWeight,
      lineHeight: element.style.lineHeight,
      paddingTop: element.style.paddingTop,
      paddingRight: element.style.paddingRight,
      paddingBottom: element.style.paddingBottom,
      paddingLeft: element.style.paddingLeft,
      borderRadius: element.style.borderRadius,
      boxShadow: element.style.boxShadow
    };

    const item = {
      element,
      selector,
      tagName: element.tagName.toLowerCase(),
      bbox: {
        top: bbox.top + this.win.scrollY,
        left: bbox.left + this.win.scrollX,
        width: bbox.width,
        height: bbox.height
      },
      baseline: {
        text: this.canEditText(element) ? element.textContent : null,
        inline: baselineInline
      }
    };

    const updated = [...elements, item];
    this.stateManager.set('selection.elements', updated);

    this.highlightManager.addSelection(element, updated.length - 1);
    this.eventBus.emit('element:selected', item);

    // Exit element mode after each selection for clarity
    this.deactivate();
  }

  clearSelections() {
    this.stateManager.set('selection.elements', []);
    this.highlightManager.clearAllSelections();
    this.eventBus.emit('selections:cleared');
  }
}

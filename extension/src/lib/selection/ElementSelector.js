/**
 * ElementSelector - Handle element selection mode
 */

import { shouldIgnoreElement, getElementSelector } from '../utils/dom.js';

export default class ElementSelector {
  constructor(eventBus, stateManager, highlightManager, topBanner) {
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.highlightManager = highlightManager;
    this.topBanner = topBanner;
    this.isActive = false;
    
    // Bind methods
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.stateManager.set('ui.mode', 'element');
    
    this.topBanner.update('Click to select element • Shift+Click to add to context');
    
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.documentElement.classList.add('lumi-element-cursor');
    document.body.classList.add('lumi-element-cursor');
    
    this.eventBus.emit('element-mode:activated');
  }

  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.stateManager.set('ui.mode', 'idle');
    
    this.topBanner.hide();
    this.highlightManager.hideHover();
    
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.documentElement.classList.remove('lumi-element-cursor');
    document.body.classList.remove('lumi-element-cursor');
    
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

  handleClick(e) {
    if (!this.isActive || shouldIgnoreElement(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    // UX: element mode is additive by default (no Shift required)
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
    
    const item = {
      element,
      selector,
      tagName: element.tagName.toLowerCase(),
      bbox: {
        top: bbox.top + window.scrollY,
        left: bbox.left + window.scrollX,
        width: bbox.width,
        height: bbox.height
      }
    };
    
    const updated = [...elements, item];
    this.stateManager.set('selection.elements', updated);

    this.highlightManager.addSelection(element);
    this.eventBus.emit('element:selected', item);
  }

  clearSelections() {
    this.stateManager.set('selection.elements', []);
    this.highlightManager.clearAllSelections();
    this.eventBus.emit('selections:cleared');
  }
}

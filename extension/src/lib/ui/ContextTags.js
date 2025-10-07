/**
 * ContextTags - Manage context tags (elements and screenshot)
 * Handles tag display, deletion, and inline chip insertion
 */

import { readableElementName } from '../utils/dom.js';

export default class ContextTags {
  constructor(shadowRoot, eventBus, stateManager) {
    this.shadowRoot = shadowRoot;
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.container = null;
  }

  mount() {
    this.container = this.shadowRoot.getElementById('context-tags');
    if (!this.container) {
      console.error('[ContextTags] Container not found');
    }
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = '';
    
    const elements = this.stateManager.get('selection.elements');
    const screenshot = this.stateManager.get('selection.screenshot');
    
    // Render element tags
    elements.forEach((item, index) => {
      const tag = document.createElement('div');
      tag.className = 'context-tag';
      tag.innerHTML = `
        <span class="tag-label" data-index="${index}" data-type="element">${readableElementName(item.element)}</span>
        <span class="tag-remove" data-type="element" data-index="${index}">×</span>
      `;
      this.container.appendChild(tag);
    });
    
    // Render screenshot tag
    if (screenshot) {
      const tag = document.createElement('div');
      tag.className = 'context-tag screenshot';
      tag.innerHTML = `
        <span class="tag-label" data-type="screenshot">Screenshot</span>
        <span class="tag-remove" data-type="screenshot">×</span>
      `;
      this.container.appendChild(tag);
    }
    
    // Add event listeners
    this.attachListeners();
  }

  attachListeners() {
    if (!this.container) return;
    
    // Remove buttons
    this.container.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.target.dataset.type;
        const index = e.target.dataset.index;
        
        if (type === 'element') {
          this.removeElement(parseInt(index));
        } else if (type === 'screenshot') {
          this.removeScreenshot();
        }
      });
    });
    
    // Label click to insert inline chip
    this.container.querySelectorAll('.tag-label').forEach(label => {
      label.addEventListener('click', (e) => {
        const type = e.target.dataset.type;
        
        if (type === 'screenshot') {
          this.insertInlineTag('Screenshot', 'screenshot');
        } else {
          const idx = parseInt(e.target.dataset.index);
          const elements = this.stateManager.get('selection.elements');
          if (elements[idx]) {
            this.insertInlineTag(readableElementName(elements[idx].element), idx);
          }
        }
      });
    });
  }

  insertInlineTag(label, index) {
    const input = this.shadowRoot.getElementById('intent-input');
    if (!input) return;
    
    input.focus();
    
    const selection = window.getSelection();
    let range;
    
    if (selection && selection.rangeCount > 0 && input.contains(selection.anchorNode)) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
    }
    
    const tag = document.createElement('span');
    tag.className = 'inline-element-tag';
    tag.dataset.index = String(index);
    tag.textContent = label;
    tag.setAttribute('contenteditable', 'false');
    
    const remove = document.createElement('span');
    remove.className = 'inline-tag-remove';
    remove.textContent = '×';
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      tag.remove();
      this.eventBus.emit('input:changed');
    });
    tag.appendChild(remove);
    
    // Normalize whitespace: remove trailing spaces before insertion
    if (range.startContainer.nodeType === 3 && /\s$/.test(range.startContainer.textContent)) {
      range.startContainer.textContent = range.startContainer.textContent.replace(/\s+$/, ' ');
    }
    
    range.deleteContents();
    range.insertNode(tag);
    range.setStartAfter(tag);
    range.collapse(true);
    
    // Insert trailing space for easier deletion
    const space = document.createTextNode(' ');
    if (!range.startContainer || range.startContainer !== input) {
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
    }
    
    selection.removeAllRanges();
    selection.addRange(range);
    
    this.eventBus.emit('input:changed');
  }

  removeElement(index) {
    const elements = this.stateManager.get('selection.elements');
    elements.splice(index, 1);
    this.stateManager.set('selection.elements', elements);
    
    // Remove corresponding inline chips
    const input = this.shadowRoot.getElementById('intent-input');
    if (input) {
      input.querySelectorAll(`.inline-element-tag[data-index="${String(index)}"]`).forEach(node => {
        this.cleanupWhitespaceAroundNode(node);
        node.remove();
      });
    }
    
    this.eventBus.emit('element:removed', index);
    this.render();
  }

  removeScreenshot() {
    this.stateManager.set('selection.screenshot', null);
    
    // Remove corresponding inline chips
    const input = this.shadowRoot.getElementById('intent-input');
    if (input) {
      input.querySelectorAll('.inline-element-tag[data-index="screenshot"]').forEach(node => {
        this.cleanupWhitespaceAroundNode(node);
        node.remove();
      });
    }
    
    this.eventBus.emit('screenshot:removed');
    this.render();
  }

  cleanupWhitespaceAroundNode(node) {
    const prev = node.previousSibling;
    const next = node.nextSibling;
    
    if (next && next.nodeType === 3 && next.textContent.startsWith(' ')) {
      next.textContent = next.textContent.slice(1);
    } else if (prev && prev.nodeType === 3 && /\s$/.test(prev.textContent)) {
      prev.textContent = prev.textContent.replace(/\s$/, '');
    }
  }

  clear() {
    this.stateManager.batch({
      'selection.elements': [],
      'selection.screenshot': null
    });
    
    const input = this.shadowRoot.getElementById('intent-input');
    if (input) {
      input.textContent = '';
    }
    
    this.render();
  }
}


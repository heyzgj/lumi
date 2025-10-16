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
    this.lastIntentRange = null; // persist caret position within intent input
    this.CARET_MARK_ATTR = 'data-caret-marker';
    this._pointerInserted = false;
  }

  mount() {
    this.container = this.shadowRoot.getElementById('context-tags');
    if (!this.container) {
      console.error('[ContextTags] Container not found');
    }

    // Track caret position inside the intent input so we can restore it
    const input = this.shadowRoot.getElementById('intent-input');
    if (input) {
      const updateRange = (source) => {
        const sel = this._getSelection();
        if (sel && sel.rangeCount > 0 && input.contains(sel.anchorNode)) {
          this.lastIntentRange = sel.getRangeAt(0).cloneRange();
        }
      };
      // Capture on common user interactions that change caret (avoid 'focus' which may be [input,0])
      ['keyup', 'mouseup', 'input'].forEach(evt => {
        input.addEventListener(evt, () => updateRange(evt));
      });

      // Global selection tracking covers keyboard-based caret moves and OS selection changes
      document.addEventListener('selectionchange', () => updateRange('selectionchange'));

      input.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left click only
        try {
          const x = e.clientX, y = e.clientY;
          const hit = this._rangeFromPoint(x, y, input);
          const shouldOverride = !!hit;
          if (shouldOverride) e.preventDefault();
          requestAnimationFrame(() => {
            input.focus();
            if (shouldOverride) {
              const sel = this._getSelection();
              sel.removeAllRanges();
              sel.addRange(hit);
              this.lastIntentRange = hit.cloneRange();
            }
          });
        } catch (_) {}
      });

      // Capture selection just before any click inside the bubble changes it (capture phase)
      const preClickSnapshot = () => {
        const sel = this._getSelection();
        if (sel && sel.rangeCount > 0 && input.contains(sel.anchorNode)) {
          this.lastIntentRange = sel.getRangeAt(0).cloneRange();
        }
      };
      try {
        this.shadowRoot.addEventListener('pointerdown', preClickSnapshot, { capture: true });
        this.shadowRoot.addEventListener('mousedown', preClickSnapshot, { capture: true });
        this.shadowRoot.addEventListener('touchstart', preClickSnapshot, { capture: true, passive: true });
      } catch (_) {
        // Fallback for environments without options support
        this.shadowRoot.addEventListener('pointerdown', preClickSnapshot, true);
        this.shadowRoot.addEventListener('mousedown', preClickSnapshot, true);
        this.shadowRoot.addEventListener('touchstart', preClickSnapshot, true);
      }
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = '';

    const elements = this.stateManager.get('selection.elements');
    const screenshots = this.stateManager.get('selection.screenshots') || [];
    const input = this.shadowRoot.getElementById('intent-input');

    // Helper function to check if tag is already inserted
    const isTagInserted = (type, index) => {
      if (!input) return false;
      if (type === 'screenshot') {
        return input.querySelector(`.inline-element-tag[data-index="${String(index)}"]`) !== null;
      } else {
        return input.querySelector(`.inline-element-tag[data-index="${String(index)}"]`) !== null;
      }
    };

    // Render element tags
    elements.forEach((item, index) => {
      const tag = document.createElement('div');
      const isInserted = isTagInserted('element', index);

      tag.className = `context-tag${isInserted ? ' inserted' : ''}`;
      tag.innerHTML = `
        <span class="tag-label" data-index="${index}" data-type="element">${readableElementName(item.element)}</span>
        <span class="tag-remove" data-type="element" data-index="${index}">×</span>
      `;
      this.container.appendChild(tag);
    });

    // Render screenshot tags (multiple)
    screenshots.forEach((shot, idx) => {
      const tag = document.createElement('div');
      const key = `ss-${shot.id}`;
      const isInserted = isTagInserted('screenshot', key);

      tag.className = `context-tag${isInserted ? ' inserted' : ''}`;
      tag.innerHTML = `
        <span class="tag-label" data-type="screenshot" data-index="${key}">Screenshot ${idx + 1}</span>
        <span class="tag-remove" data-type="screenshot" data-id="${shot.id}">×</span>
      `;
      this.container.appendChild(tag);
    });

    // Add event listeners and sync inserted state
    this.attachListeners();
    this.updateInsertedStates();
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
          const id = e.target.dataset.id ? parseInt(e.target.dataset.id) : null;
          this.removeScreenshot(id);
        }
      });
    });
    
    // Label click to insert inline chip
    this.container.querySelectorAll('.tag-label').forEach(label => {
      // Prevent focus change so the input caret stays intact
      label.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Snapshot caret before input blurs (pointerdown fires before blur/click)
        const input = this.shadowRoot.getElementById('intent-input');
        if (!input) return;
        const sel = this._getSelection();
        if (sel && sel.rangeCount > 0 && input.contains(sel.anchorNode)) {
          this.lastIntentRange = sel.getRangeAt(0).cloneRange();
          // Also drop a temporary marker so we can recover exact spot even if focus shifts
          this._placeCaretMarker(this.lastIntentRange);
        }
        // If no stored range and no live selection inside input, seed to end of input
        if (!this.lastIntentRange) {
          const seeded = document.createRange();
          seeded.selectNodeContents(input);
          seeded.collapse(false);
          this.lastIntentRange = seeded.cloneRange();
        }

        // Perform insertion immediately on pointerdown to avoid any post-up focus/selection changes
        const type = e.currentTarget.dataset.type;
        if (type === 'screenshot') {
          this._pointerInserted = true;
          const key = e.currentTarget.dataset.index;
          this.insertInlineTag(e.currentTarget.textContent, key);
        } else {
          const idx = parseInt(e.currentTarget.dataset.index);
          const elements = this.stateManager.get('selection.elements');
          if (elements[idx]) {
            this._pointerInserted = true;
            this.insertInlineTag(readableElementName(elements[idx].element), idx);
          }
        }
      });
      label.addEventListener('mousedown', (e) => {
        // Some environments dispatch only mouse events; prevent default to avoid focus steal
        e.preventDefault();
      });

      label.addEventListener('click', (e) => {
        // If we already handled pointerdown insertion, ignore the click
        if (this._pointerInserted) {
          this._pointerInserted = false;
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const type = e.currentTarget.dataset.type;
        
        if (type === 'screenshot') {
          const key = e.currentTarget.dataset.index;
          this.insertInlineTag(e.currentTarget.textContent, key);
        } else {
          const idx = parseInt(e.currentTarget.dataset.index);
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

    // Check if tag is already inserted (prevent duplicates)
    const existingTag = input.querySelector(`.inline-element-tag[data-index="${String(index)}"]`);
    if (existingTag) {
      // Tag already exists, just focus it and scroll into view
      existingTag.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      input.focus();
      return;
    }

    // Choose the best available caret: prefer explicit marker, then live selection, then cached range
    const selection = this._getSelection();
    let workingRange = null;

    // If input isn't focused or selection isn't in input, try to restore the last known caret first
    const shadowActive = this.shadowRoot.activeElement;
    if ((!shadowActive || shadowActive !== input) && this.lastIntentRange) {
      try {
        selection.removeAllRanges();
        selection.addRange(this.lastIntentRange.cloneRange());
      } catch (_) {}
    }
    const marker = input.querySelector(`[${this.CARET_MARK_ATTR}="1"]`);
    if (marker) {
      workingRange = document.createRange();
      workingRange.setStartBefore(marker);
      workingRange.collapse(true);
      // Clean up marker immediately
      marker.remove();
    }
    if (!workingRange && selection && selection.rangeCount > 0 && input.contains(selection.anchorNode)) {
      workingRange = selection.getRangeAt(0).cloneRange();
    } else if (!workingRange && this.lastIntentRange) {
      workingRange = this.lastIntentRange.cloneRange();
    }

    input.focus();
    if (workingRange) {
      selection.removeAllRanges();
      selection.addRange(workingRange);
    }

    const range = workingRange || (() => {
      // Fallback: find better insertion point than just end of input
      const fallbackRange = document.createRange();

      // If there's existing content, find the logical insertion point
      const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null);
      let lastTextNode = null;
      let textNode;

      while (textNode = walker.nextNode()) {
        lastTextNode = textNode;
      }

      if (lastTextNode && lastTextNode.textContent.trim()) {
        // Insert at end of last meaningful text content
        fallbackRange.setStart(lastTextNode, lastTextNode.textContent.length);
        fallbackRange.setEnd(lastTextNode, lastTextNode.textContent.length);
      } else {
        // Empty or only tags - insert at end of input
        fallbackRange.selectNodeContents(input);
        fallbackRange.collapse(false);
      }

      return fallbackRange;
    })();
    
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
      this.updateInsertedStates();
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

    // Insert trailing space for easier deletion (simplified logic)
    const space = document.createTextNode(' ');
    range.insertNode(space);
    range.setStartAfter(space);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
    // Persist the latest caret position for the next interaction
    this.lastIntentRange = range.cloneRange();
    this.eventBus.emit('input:changed');
    this.updateInsertedStates();
  }

  _placeCaretMarker(range) {
    try {
      if (!range) return;
      // Remove any existing markers first
      const input = this.shadowRoot.getElementById('intent-input');
      if (!input) return;
      input.querySelectorAll(`[${this.CARET_MARK_ATTR}]`).forEach(n => n.remove());

      const marker = document.createElement('span');
      marker.setAttribute(this.CARET_MARK_ATTR, '1');
      // Invisible, zero footprint
      marker.style.cssText = 'display:inline-block;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;';
      // Use a ZWSP to ensure the node positions correctly in text nodes
      marker.textContent = '\u200b';
      const collapsed = range.cloneRange();
      collapsed.collapse(true);
      collapsed.insertNode(marker);
    } catch (_) {
      // Best-effort; if marker fails we still rely on cached range
    }
  }

  updateInsertedStates() {
    if (!this.container) return;
    const input = this.shadowRoot.getElementById('intent-input');
    if (!input) return;

    this.container.querySelectorAll('.context-tag').forEach(tag => {
      const label = tag.querySelector('.tag-label');
      if (!label) return;
      const index = label.dataset.index;
      const selector = `.inline-element-tag[data-index="${String(index)}"]`;
      const inserted = !!input.querySelector(selector);
      tag.classList.toggle('inserted', inserted);
    });
  }

  _getSelection() {
    try {
      if (this.shadowRoot && typeof this.shadowRoot.getSelection === 'function') {
        const sel = this.shadowRoot.getSelection();
        if (sel) return sel;
      }
    } catch (_) {}
    try {
      return window.getSelection();
    } catch (_) {
      return null;
    }
  }

  _rangeFromPoint(x, y, root) {
    try {
      let range = null;
      // Prefer standard caretPositionFromPoint if available (gives node + offset)
      const pos = (this.shadowRoot && typeof this.shadowRoot.caretPositionFromPoint === 'function')
        ? this.shadowRoot.caretPositionFromPoint(x, y)
        : (document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null);
      if (pos && pos.offsetNode) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
      if (!range) {
        const r2 = (this.shadowRoot && typeof this.shadowRoot.caretRangeFromPoint === 'function')
          ? this.shadowRoot.caretRangeFromPoint(x, y)
          : (document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null);
        if (r2) {
          range = r2;
        }
      }
      if (range && root && !root.contains(range.startContainer)) {
        // If the calculated range is not within the input, ignore it
        return null;
      }
      return range;
    } catch (_) {
      return null;
    }
  }

  removeElement(index) {
    const elements = this.stateManager.get('selection.elements');
    elements.splice(index, 1);
    this.stateManager.set('selection.elements', elements);

    // Remove corresponding inline chips and update indices for remaining elements
    const input = this.shadowRoot.getElementById('intent-input');
    if (input) {
      // Remove the specific inline tag for this element
      input.querySelectorAll(`.inline-element-tag[data-index="${String(index)}"]`).forEach(node => {
        this.cleanupWhitespaceAroundNode(node);
        node.remove();
      });

      // Update indices for all subsequent inline tags (critical fix)
      input.querySelectorAll('.inline-element-tag').forEach(tag => {
        const currentIndex = parseInt(tag.dataset.index);
        if (currentIndex > index) {
          tag.dataset.index = String(currentIndex - 1);
        }
      });
    }

    this.eventBus.emit('element:removed', index);
    this.render();
  }

  removeScreenshot(id) {
    const list = (this.stateManager.get('selection.screenshots') || []).slice();
    const idx = list.findIndex(s => s.id === id);
    if (idx >= 0) list.splice(idx, 1);
    this.stateManager.set('selection.screenshots', list);
    
    // Remove corresponding inline chips
    const input = this.shadowRoot.getElementById('intent-input');
    if (input) {
      input.querySelectorAll(`.inline-element-tag[data-index="ss-${id}"]`).forEach(node => {
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
      'selection.screenshots': []
    });

    const input = this.shadowRoot.getElementById('intent-input');
    if (input) {
      // Remove all inline tags and clear the input
      input.querySelectorAll('.inline-element-tag').forEach(tag => {
        tag.remove();
      });
      input.textContent = '';
    }

    this.render();
  }
}

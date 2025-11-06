/**
 * ServerClient - Handle server communication
 */

import {
  getComputedStyleSummary,
  getElementClassList,
  getElementDataset,
  getAncestorTrail,
  detectFrameworkSignatures
} from '../utils/dom.js';

export default class ServerClient {
  constructor(chromeBridge) {
    this.chromeBridge = chromeBridge;
  }

  async execute(engine, intent, elements, screenshot, pageInfo, screenshots = [], edits = []) {
    const context = this.buildContext(intent, elements, screenshot, pageInfo, screenshots, edits);
    
    try {
      const result = await this.chromeBridge.executeOnServer(
        engine,
        context,
        screenshot?.dataUrl
      );
      
      return result;
    } catch (error) {
      console.error('[ServerClient] Execution failed:', error);
      throw error;
    }
  }

  buildContext(intent, elements, screenshot, pageInfo, screenshots = [], edits = []) {
    const context = {
      intent,
      pageUrl: pageInfo.url,
      pageTitle: pageInfo.title,
      selectionMode: elements.length > 0 ? 'element' : 'screenshot',
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };

    const { frameworks, styleStrategy } = detectFrameworkSignatures();
    context.meta = {
      frameworks,
      styleStrategy
    };
    
    // Add element context - support multiple elements
    if (elements.length > 0) {
      if (elements.length === 1) {
        // Single element - keep original format
        context.element = {
          tagName: elements[0].element.tagName,
          selector: elements[0].selector,
          className: elements[0].element.className,
          classList: getElementClassList(elements[0].element),
          dataset: getElementDataset(elements[0].element),
          ancestors: getAncestorTrail(elements[0].element),
          id: elements[0].element.id,
          outerHTML: elements[0].element.outerHTML,
          textContent: getElementText(elements[0].element),
          computedStyle: getComputedStyleSummary(elements[0].element)
        };
        context.bbox = elements[0].bbox;
      } else {
        // Multiple elements - send as array
        context.elements = elements.map((item, index) => ({
          index: index + 1,
          tagName: item.element.tagName,
          selector: item.selector,
          className: item.element.className,
          classList: getElementClassList(item.element),
          dataset: getElementDataset(item.element),
          ancestors: getAncestorTrail(item.element),
          id: item.element.id,
          outerHTML: item.element.outerHTML,
          textContent: getElementText(item.element),
          computedStyle: getComputedStyleSummary(item.element),
          bbox: item.bbox
        }));
        context.elementCount = elements.length;
      }
    }
    
    // Add screenshot context (single + multiple)
    if (screenshots && screenshots.length > 0) {
      context.screenshots = screenshots.map((s, i) => ({ index: i + 1, bbox: s.bbox }));
    }
    if (screenshot) {
      context.screenshot = screenshot;
    }

    // Include WYSIWYG edits if present
    if (edits && edits.length) {
      context.edits = edits.map(e => ({
        index: e.index,
        selector: e.selector,
        changes: e.changes,
        summary: e.summary
      }));
    }
    
    return context;
  }
}

function getElementText(element) {
  if (!element) return '';
  const text = (element.textContent || '').trim();
  return text.length > 400 ? text.slice(0, 400) + '…' : text;
}

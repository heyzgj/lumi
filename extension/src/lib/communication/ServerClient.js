/**
 * ServerClient - Handle server communication
 */

import { getComputedStyleSummary } from '../utils/dom.js';

export default class ServerClient {
  constructor(chromeBridge) {
    this.chromeBridge = chromeBridge;
  }

  async execute(engine, intent, elements, screenshot, pageInfo) {
    const context = this.buildContext(intent, elements, screenshot, pageInfo);
    
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

  buildContext(intent, elements, screenshot, pageInfo) {
    const context = {
      intent,
      pageUrl: pageInfo.url,
      pageTitle: pageInfo.title,
      selectionMode: elements.length > 0 ? 'element' : 'screenshot'
    };
    
    // Add element context - support multiple elements
    if (elements.length > 0) {
      if (elements.length === 1) {
        // Single element - keep original format
        context.element = {
          tagName: elements[0].element.tagName,
          selector: elements[0].selector,
          className: elements[0].element.className,
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
          id: item.element.id,
          outerHTML: item.element.outerHTML,
          textContent: getElementText(item.element),
          computedStyle: getComputedStyleSummary(item.element),
          bbox: item.bbox
        }));
        context.elementCount = elements.length;
      }
    }
    
    // Add screenshot context
    if (screenshot) {
      context.screenshot = screenshot;
    }
    
    return context;
  }
}

function getElementText(element) {
  if (!element) return '';
  const text = (element.textContent || '').trim();
  return text.length > 400 ? text.slice(0, 400) + '…' : text;
}

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

  async executeStream(engine, intent, elements, screenshot, pageInfo, screenshots = [], edits = [], streamId) {
    const context = this.buildContext(intent, elements, screenshot, pageInfo, screenshots, edits);

    try {
      await this.chromeBridge.executeStreamOnServer(
        engine,
        context,
        streamId
      );
      return { ok: true };
    } catch (error) {
      console.error('[ServerClient] Stream execution failed:', error);
      throw error;
    }
  }

  buildContext(intent, elements, screenshot, pageInfo, screenshots = [], edits = []) {
    const context = {
      intent,
      pageUrl: pageInfo.url,
      pageTitle: pageInfo.title,
      selectionMode: elements.length > 0 ? 'element' : 'screenshot',
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };

    const { frameworks, styleStrategy } = detectFrameworkSignatures();
    context.meta = { frameworks, styleStrategy };

    const tagMap = {};

    // Elements → tag mapping and rich context
    if (Array.isArray(elements) && elements.length > 0) {
      context.elements = elements.map((item, idx) => {
        const tag = `@element${idx + 1}`;
        tagMap[tag] = { type: 'element', index: idx };
        const el = item.element;
        return {
          tag,
          index: idx + 1,
          selector: item.selector,
          tagName: el?.tagName,
          className: el?.className,
          classList: getElementClassList(el),
          dataset: getElementDataset(el),
          ancestors: getAncestorTrail(el),
          id: el?.id,
          outerHTML: el?.outerHTML,
          textContent: getElementText(el),
          computedStyle: getComputedStyleSummary(el),
          bbox: item.bbox,
          baseline: item.baseline || null,
          edited: !!item.edited
        };
      });
      context.elementCount = context.elements.length;
    }

    // Screenshots → tag mapping
    if (Array.isArray(screenshots) && screenshots.length > 0) {
      context.screenshots = screenshots.map((s, i) => {
        const tag = `@screenshot${i + 1}`;
        tagMap[tag] = { type: 'screenshot', index: i };
        return {
          tag,
          index: i + 1,
          bbox: s.bbox,
          dataUrl: s.dataUrl,
          id: s.id,
          createdAt: s.createdAt
        };
      });
    }
    if (screenshot) {
      // Legacy single-shot field for CLI image path flow
      context.screenshot = screenshot.dataUrl || screenshot;
    }

    // Include WYSIWYG edits with before/after derived from baseline
    if (Array.isArray(edits) && edits.length) {
      const elementByIndex = (i) => (context.elements || [])[i] || null;
      context.edits = edits.map(e => {
        const el = elementByIndex(e.index);
        const base = el?.baseline || {};
        const diffs = Object.entries(e.changes || {}).map(([prop, after]) => {
          const before = (base.inline && base.inline[prop] !== undefined)
            ? base.inline[prop]
            : (prop === 'text' && typeof base.text === 'string' ? base.text : 'unset');
          return { property: prop, before, after };
        });
        return {
          tag: el?.tag || `@element${(e.index ?? 0) + 1}`,
          selector: e.selector,
          diffs,
          summary: e.summary
        };
      });
    }

    context.tagMap = tagMap;
    return context;
  }
}

function getElementText(element) {
  if (!element) return '';
  const text = (element.textContent || '').trim();
  return text.length > 400 ? text.slice(0, 400) + '…' : text;
}

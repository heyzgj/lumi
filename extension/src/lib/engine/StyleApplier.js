/**
 * StyleApplier - Injects and manages scoped style rules for WYSIWYG edits
 */

const SHEET_ID = 'lumi-style-sheet';

export default class StyleApplier {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.sheet = null;
    this.ruleMap = new Map(); // key -> { selector, property, value }
  }

  ensureSheet() {
    if (this.sheet) return this.sheet;
    let styleEl = document.getElementById(SHEET_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = SHEET_ID;
      styleEl.dataset.lumi = 'styles';
      document.head.appendChild(styleEl);
    }
    this.sheet = styleEl.sheet;
    return this.sheet;
  }

  apply(element, property, value, context = {}) {
    if (!element || !property) return;
    const sheet = this.ensureSheet();
    const selector = this.getSelectorForElement(element, context);
    const key = this.getRuleKey(selector, property, context);

    // Normalize JS-style property (e.g. marginTop) to CSS property (margin-top)
    const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
    const ruleBody = `${cssProperty}: ${value};`;
    const cssRule = `${selector} { ${ruleBody} }`;

    this.removeRule(key);
    try {
      const index = sheet.cssRules.length;
      sheet.insertRule(cssRule, index);
      this.ruleMap.set(key, { index, selector, property, value, context });
    } catch (error) {
      console.warn('[StyleApplier] Failed to insert rule', cssRule, error);
    }
  }

  remove(element, property, context = {}) {
    if (!element || !property) return;
    const selector = this.getSelectorForElement(element, context);
    const key = this.getRuleKey(selector, property, context);
    this.removeRule(key);
  }

  clear() {
    const sheet = this.ensureSheet();
    while (sheet.cssRules.length) {
      sheet.deleteRule(sheet.cssRules.length - 1);
    }
    this.ruleMap.clear();
  }

  export() {
    const rules = [];
    this.ruleMap.forEach((entry) => {
      const { selector, property, value, context } = entry;
      rules.push({ selector, property, value, context });
    });
    return rules;
  }

  getSelectorForElement(element, context = {}) {
    const { index } = context;
    if (!element.dataset.lumiId) {
      element.dataset.lumiId = this.generateId(element, index);
    }
    const baseSelector = `[data-lumi-id="${element.dataset.lumiId}"]`;

    const { breakpoint, state } = context;
    let selector = baseSelector;

    if (state) {
      selector = `${selector}:${state}`;
    }

    if (breakpoint) {
      return `@media ${breakpoint} { ${selector}`;
    }

    return selector;
  }

  getRuleKey(selector, property, context = {}) {
    const scope = context.breakpoint ? context.breakpoint : 'default';
    const state = context.state || 'default';
    return `${scope}|${state}|${selector}|${property}`;
  }

  removeRule(key) {
    if (!this.ruleMap.has(key)) return;
    const entry = this.ruleMap.get(key);
    const sheet = this.ensureSheet();
    if (entry.index !== undefined && sheet.cssRules[entry.index]) {
      sheet.deleteRule(entry.index);
    } else {
      // fallback: search by selector/property
      for (let i = sheet.cssRules.length - 1; i >= 0; i -= 1) {
        const rule = sheet.cssRules[i];
        if (rule.selectorText === entry.selector && rule.style && rule.style[entry.property] !== undefined) {
          sheet.deleteRule(i);
        }
      }
    }
    this.ruleMap.delete(key);
  }

  generateId(element, index) {
    const base = element.tagName ? element.tagName.toLowerCase() : 'node';
    const random = Math.random().toString(36).slice(2, 7);
    return `${base}-${index !== undefined ? index : 'x'}-${random}`;
  }
}

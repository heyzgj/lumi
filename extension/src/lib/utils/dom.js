/**
 * DOM Utilities
 */

/**
 * Get CSS selector for an element
 */
export function getElementSelector(element) {
  if (!element) return '';

  // Prefer id when available
  if (element.id) return `#${CSS.escape(element.id)}`;

  const parts = [];
  const tag = element.tagName ? element.tagName.toLowerCase() : '*';
  parts.push(tag);

  // Use up to 2 class names for specificity
  const classes = Array.from(element.classList || []).slice(0, 2);
  classes.forEach(cls => parts.push(`.${CSS.escape(cls)}`));

  let selector = parts.join('');

  // If selector without nth-child uniquely identifies element, return early
  try {
    if (element.ownerDocument?.querySelectorAll(selector).length === 1) {
      return selector;
    }
  } catch (_) {
    // Fall through if invalid selector
  }

  // Otherwise, include :nth-of-type and parent context to ensure uniqueness
  const position = getNthOfType(element);
  selector = `${selector}:nth-of-type(${position})`;

  const parent = element.parentElement;
  if (parent && parent !== document.body && parent !== document.documentElement) {
    const parentSelector = getElementSelector(parent);
    if (parentSelector) {
      selector = `${parentSelector} > ${selector}`;
    }
  }

  return selector;
}

function getNthOfType(element) {
  if (!element || !element.parentElement) return 1;
  const tagName = element.tagName;
  if (!tagName) return 1;
  let index = 1;
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === tagName) {
      index += 1;
    }
    sibling = sibling.previousElementSibling;
  }
  return index;
}

/**
 * Get human-readable element name
 */
export function readableElementName(element) {
  if (!element) return 'element';
  if (element.id) return `#${element.id}`;
  // className can be an SVGAnimatedString or object; normalize to string safely
  let classStr = '';
  try {
    const raw = element.className;
    classStr = typeof raw === 'string' ? raw : (raw && typeof raw.baseVal === 'string' ? raw.baseVal : '');
  } catch (_) { classStr = ''; }
  const firstClass = classStr.split(' ').filter(Boolean)[0];
  if (firstClass) return `${element.tagName.toLowerCase()}.${firstClass}`;
  return element.tagName.toLowerCase();
}

/**
 * Get computed style summary for an element
 */
export function getComputedStyleSummary(element) {
  const computed = window.getComputedStyle(element);
  return {
    display: computed.display,
    position: computed.position,
    width: computed.width,
    height: computed.height,
    backgroundColor: computed.backgroundColor,
    color: computed.color,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight,
    fontFamily: computed.fontFamily,
    padding: computed.padding,
    margin: computed.margin,
    border: computed.border,
    borderRadius: computed.borderRadius,
    boxShadow: computed.boxShadow,
    paddingTop: computed.paddingTop,
    paddingRight: computed.paddingRight,
    paddingBottom: computed.paddingBottom,
    paddingLeft: computed.paddingLeft,
    marginTop: computed.marginTop,
    marginRight: computed.marginRight,
    marginBottom: computed.marginBottom,
    marginLeft: computed.marginLeft,
    cssVars: collectCSSVariables(computed)
  };
}

/**
 * Check if element should be ignored for selection
 */
export function shouldIgnoreElement(element) {
  if (!element) return true;
  
  // Ignore LUMI's own elements
  if (element.closest('#lumi-bubble-container') || 
      element.closest('#lumi-top-banner') ||
      element.closest('#lumi-dock-root') ||
      element.closest('#lumi-interaction-bubble') ||
      element.closest('#dock-edit-modal') ||
      element.id === 'dock-edit-overlay' ||
      element.id === 'lumi-dock-launcher' ||
      element.closest('#lumi-controls-overlay') ||
      element.classList?.contains('lumi-highlight') ||
      element.classList?.contains('lumi-screenshot-overlay') ||
      element.classList?.contains('lumi-highlight-pen')) {
    return true;
  }
  // Ignore clicks inside Shadow DOM hosted by the dock
  try {
    const root = element.getRootNode && element.getRootNode();
    if (root && root.host && root.host.id === 'lumi-dock-root') return true;
  } catch (_) {}
  
  const tag = element.tagName && element.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return true;
  
  return false;
}

export function getElementClassList(element) {
  if (!element || !element.classList) return [];
  return Array.from(element.classList);
}

export function getElementDataset(element) {
  if (!element || !element.dataset) return {};
  return { ...element.dataset };
}

export function getAncestorTrail(element, limit = 4) {
  const trail = [];
  let current = element?.parentElement || null;
  while (current && trail.length < limit) {
    const tag = current.tagName ? current.tagName.toLowerCase() : 'unknown';
    const item = { tag };
    if (current.id) item.id = current.id;
    const firstClass = current.classList?.[0];
    if (firstClass) item.class = firstClass;
    const nth = getNthOfType(current);
    item.nth = nth;
    trail.push(item);
    current = current.parentElement;
  }
  return trail;
}

export function detectFrameworkSignatures() {
  const frameworks = {
    react: !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || !!document.querySelector('[data-reactroot], [data-reactid]'),
    vue: !!window.__VUE_DEVTOOLS_GLOBAL_HOOK__ || !!document.querySelector('[data-v-app], [data-v-]'),
    tailwind: detectTailwind(),
    cssModules: detectCssModules(),
    cssInJs: detectCssInJs()
  };

  const styleStrategy = determineStyleStrategy(frameworks);

  return { frameworks, styleStrategy };
}

function detectTailwind() {
  if (document.querySelector('link[href*="tailwind"], script[src*="tailwind"]')) return true;
  if (document.querySelector('style[data-tailwind]')) return true;
  const candidates = ['bg-', 'text-', 'px-', 'py-', 'mx-', 'my-', 'rounded-', 'shadow-', 'grid-cols-'];
  return candidates.some(prefix => document.querySelector(`[class*="${prefix}"]`));
}

function detectCssModules() {
  const elements = document.querySelectorAll('[class]');
  const pattern = /_[a-z0-9]{4,}$/i;
  let matches = 0;
  let inspected = 0;
  for (const el of elements) {
    inspected += 1;
    for (const cls of el.classList) {
      if (pattern.test(cls)) {
        matches += 1;
        if (matches >= 3) {
          return true;
        }
      }
    }
    if (matches >= 3 || inspected >= 400) break;
  }
  return false;
}

function detectCssInJs() {
  if (document.querySelector('style[data-styled]')) return true;
  if (document.querySelector('style[data-emotion]')) return true;
  if (document.querySelector('style[data-css]')) return true;
  return false;
}

function determineStyleStrategy(frameworks) {
  if (frameworks.tailwind) return 'tailwind';
  if (frameworks.cssModules) return 'css-modules';
  if (frameworks.cssInJs) return 'css-in-js';
  return 'css';
}

function collectCSSVariables(computed) {
  const vars = [];
  if (!computed) return vars;
  for (let i = 0; i < computed.length; i += 1) {
    const prop = computed[i];
    if (prop && prop.startsWith('--')) {
      vars.push({ name: prop, value: computed.getPropertyValue(prop) });
    }
  }
  return vars;
}

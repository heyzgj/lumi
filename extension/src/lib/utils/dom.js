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
  const firstClass = (element.className || '').split(' ').filter(Boolean)[0];
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
    fontFamily: computed.fontFamily,
    padding: computed.padding,
    margin: computed.margin,
    border: computed.border
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
      element.classList?.contains('lumi-highlight') ||
      element.classList?.contains('lumi-screenshot-overlay')) {
    return true;
  }
  
  const tag = element.tagName && element.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return true;
  
  return false;
}

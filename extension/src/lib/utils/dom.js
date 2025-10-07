/**
 * DOM Utilities
 */

/**
 * Get CSS selector for an element
 */
export function getElementSelector(element) {
  if (element.id) return `#${element.id}`;
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c).slice(0, 2);
    return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
  }
  return element.tagName.toLowerCase();
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


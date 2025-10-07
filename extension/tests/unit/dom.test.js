/**
 * DOM Utils Tests
 */

import { describe, it, expect } from '@jest/globals';
import { getElementSelector, readableElementName, shouldIgnoreElement } from '../../src/lib/utils/dom.js';

describe('DOM Utils', () => {
  describe('getElementSelector', () => {
    it('should return ID selector for element with ID', () => {
      const div = document.createElement('div');
      div.id = 'test-id';
      expect(getElementSelector(div)).toBe('#test-id');
    });

    it('should return class selector for element with classes', () => {
      const div = document.createElement('div');
      div.className = 'class1 class2 class3';
      expect(getElementSelector(div)).toBe('div.class1.class2');
    });

    it('should return tag name for element without ID or classes', () => {
      const div = document.createElement('div');
      expect(getElementSelector(div)).toBe('div');
    });
  });

  describe('readableElementName', () => {
    it('should return ID for element with ID', () => {
      const div = document.createElement('div');
      div.id = 'my-button';
      expect(readableElementName(div)).toBe('#my-button');
    });

    it('should return tag.class for element with class', () => {
      const button = document.createElement('button');
      button.className = 'primary-btn secondary';
      expect(readableElementName(button)).toBe('button.primary-btn');
    });

    it('should return tag name for element without ID or class', () => {
      const span = document.createElement('span');
      expect(readableElementName(span)).toBe('span');
    });

    it('should return "element" for null/undefined', () => {
      expect(readableElementName(null)).toBe('element');
      expect(readableElementName(undefined)).toBe('element');
    });
  });

  describe('shouldIgnoreElement', () => {
    it('should ignore null/undefined elements', () => {
      expect(shouldIgnoreElement(null)).toBe(true);
      expect(shouldIgnoreElement(undefined)).toBe(true);
    });

    it('should ignore html and body tags', () => {
      const html = document.createElement('html');
      const body = document.createElement('body');
      expect(shouldIgnoreElement(html)).toBe(true);
      expect(shouldIgnoreElement(body)).toBe(true);
    });

    it('should ignore LUMI elements', () => {
      const div = document.createElement('div');
      div.id = 'lumi-bubble-container';
      expect(shouldIgnoreElement(div)).toBe(true);
    });

    it('should not ignore normal elements', () => {
      const button = document.createElement('button');
      button.className = 'normal-button';
      expect(shouldIgnoreElement(button)).toBe(false);
    });
  });
});


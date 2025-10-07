/**
 * TopBanner Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import TopBanner from '../../src/lib/ui/TopBanner.js';

describe('TopBanner', () => {
  let banner;

  beforeEach(() => {
    document.body.innerHTML = '';
    banner = new TopBanner();
  });

  afterEach(() => {
    banner.destroy();
  });

  it('should mount banner to document body', () => {
    banner.mount();
    
    const element = document.getElementById('lumi-top-banner');
    expect(element).toBeTruthy();
    expect(element.parentElement).toBe(document.body);
  });

  it('should show banner with message', () => {
    banner.show('Test message');
    
    const element = document.getElementById('lumi-top-banner');
    expect(element.textContent).toBe('Test message');
    expect(element.style.display).toBe('block');
  });

  it('should hide banner', () => {
    banner.show('Test message');
    banner.hide();
    
    const element = document.getElementById('lumi-top-banner');
    expect(element.style.display).toBe('none');
  });

  it('should update banner message', () => {
    banner.show('First message');
    banner.update('Second message');
    
    const element = document.getElementById('lumi-top-banner');
    expect(element.textContent).toBe('Second message');
    expect(element.style.display).toBe('block');
  });

  it('should hide banner when update called with empty message', () => {
    banner.show('Test message');
    banner.update('');
    
    const element = document.getElementById('lumi-top-banner');
    expect(element.style.display).toBe('none');
  });

  it('should destroy and remove banner from DOM', () => {
    banner.mount();
    banner.destroy();
    
    const element = document.getElementById('lumi-top-banner');
    expect(element).toBeFalsy();
  });

  it('should not error when destroying non-mounted banner', () => {
    expect(() => {
      banner.destroy();
    }).not.toThrow();
  });
});

